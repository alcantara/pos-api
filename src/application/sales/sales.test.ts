import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Product } from "../../domain/entities/product.js";
import { ProductNotFoundError } from "../../domain/entities/product.js";
import type {
  InventoryMovement,
  Sale,
  SaleItem,
  SaleWithItems,
} from "../../domain/entities/sale.js";
import {
  InsufficientStockError,
  SaleAlreadyCancelledError,
  SaleNotFoundError,
} from "../../domain/entities/sale.js";
import { ValidationError } from "../../domain/errors/domain-error.js";
import type {
  ListSalesParams,
  MovementDraft,
  PagedSales,
  SaleRepository,
  SaleWriteContext,
  StockChange,
} from "../ports/sale-repository.js";
import { cancelSale } from "./cancel-sale.js";
import { createSale } from "./create-sale.js";
import { getSale } from "./get-sale.js";
import { listSales } from "./list-sales.js";

const USER_ID = randomUUID();

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = Date.now();
  return {
    id: randomUUID(),
    sku: `SKU-${randomUUID()}`,
    name: "Keyboard",
    description: null,
    priceCents: 19990,
    stockQuantity: 10,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class InMemorySaleRepository implements SaleRepository {
  products = new Map<string, Product>();
  sales = new Map<string, SaleWithItems>();
  movements: InventoryMovement[] = [];
  startedTransactions = 0;

  async transaction<T>(fn: (ctx: SaleWriteContext) => Promise<T>): Promise<T> {
    this.startedTransactions += 1;
    const snapshot = {
      products: new Map(this.products),
      sales: new Map(this.sales),
      movements: [...this.movements],
    };

    try {
      return await fn(this.createContext());
    } catch (error) {
      this.products = snapshot.products;
      this.sales = snapshot.sales;
      this.movements = snapshot.movements;
      throw error;
    }
  }

  findById(id: string): Promise<SaleWithItems | null> {
    return Promise.resolve(this.sales.get(id) ?? null);
  }

  async list(params: ListSalesParams): Promise<PagedSales> {
    let rows = [...this.sales.values()].map(({ items: _items, ...sale }) => sale);
    if (params.status) rows = rows.filter((row) => row.status === params.status);
    if (params.customerId)
      rows = rows.filter((row) => row.customerId === params.customerId);
    rows.sort((a, b) =>
      params.sort === "totalCents"
        ? a.totalCents - b.totalCents
        : a.createdAt - b.createdAt,
    );
    if (params.order === "desc") rows.reverse();
    const total = rows.length;
    const offset = (params.page - 1) * params.limit;
    return Promise.resolve({ rows: rows.slice(offset, offset + params.limit), total });
  }

  private createContext(): SaleWriteContext {
    return {
      findProductsForUpdate: (productIds) =>
        Promise.resolve(
          productIds.flatMap((id) => {
            const product = this.products.get(id);
            return product ? [product] : [];
          }),
        ),

      findSaleForUpdate: (id) => Promise.resolve(this.sales.get(id) ?? null),

      insertSale: (sale: Sale) => {
        this.sales.set(sale.id, { ...sale, items: [] });
        return Promise.resolve();
      },

      insertSaleItems: (items: SaleItem[]) => {
        for (const item of items) {
          const sale = this.sales.get(item.saleId);
          if (!sale) return Promise.reject(new Error("sale missing"));
          sale.items.push(item);
        }
        return Promise.resolve();
      },

      updateSale: (sale: Sale) => {
        const existing = this.sales.get(sale.id);
        if (!existing) return Promise.reject(new Error("sale missing"));
        this.sales.set(sale.id, { ...sale, items: existing.items });
        return Promise.resolve();
      },

      applyStockChanges: (changes: StockChange[]) => {
        for (const change of changes) {
          const product = this.products.get(change.productId);
          if (!product) return Promise.reject(new Error("product missing"));
          if (product.stockQuantity + change.delta < 0) {
            return Promise.reject(new Error("negative stock"));
          }
          this.products.set(change.productId, {
            ...product,
            stockQuantity: product.stockQuantity + change.delta,
          });
        }
        return Promise.resolve();
      },

      recordMovements: (movements: MovementDraft[]) => {
        for (const movement of movements) {
          this.movements.push({ id: randomUUID(), ...movement });
        }
        return Promise.resolve();
      },
    };
  }
}

function seedProduct(
  repository: InMemorySaleRepository,
  overrides: Partial<Product> = {},
): Product {
  const product = makeProduct(overrides);
  repository.products.set(product.id, product);
  return product;
}

describe("createSale", () => {
  it("creates a completed sale, snapshots prices and decrements stock", async () => {
    const repository = new InMemorySaleRepository();
    const keyboard = seedProduct(repository, {
      priceCents: 19990,
      stockQuantity: 5,
    });
    const mouse = seedProduct(repository, {
      priceCents: 4990,
      stockQuantity: 10,
    });

    const sale = await createSale(repository, {
      userId: USER_ID,
      items: [
        { productId: keyboard.id, quantity: 2 },
        { productId: mouse.id, quantity: 1 },
      ],
    });

    expect(sale.status).toBe("COMPLETED");
    expect(sale.userId).toBe(USER_ID);
    expect(sale.customerId).toBeNull();
    expect(sale.totalCents).toBe(2 * 19990 + 4990);
    expect(sale.items).toHaveLength(2);
    expect(sale.items[0]).toMatchObject({
      productId: keyboard.id,
      quantity: 2,
      unitPriceCents: 19990,
      subtotalCents: 39980,
    });
    expect(sale.createdAt).toBe(sale.updatedAt);
    expect(repository.products.get(keyboard.id)?.stockQuantity).toBe(3);
    expect(repository.products.get(mouse.id)?.stockQuantity).toBe(9);
  });

  it("records one SALE movement per item", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository, { stockQuantity: 4 });

    const sale = await createSale(repository, {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 3 }],
    });

    expect(repository.movements).toHaveLength(1);
    expect(repository.movements[0]).toMatchObject({
      productId: product.id,
      type: "SALE",
      quantity: -3,
      reason: `Sale ${sale.id}`,
    });
  });

  it("stores the customer when informed", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository);
    const customerId = randomUUID();

    const sale = await createSale(repository, {
      userId: USER_ID,
      customerId,
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(sale.customerId).toBe(customerId);
  });

  it("prices items from the database, never from the caller", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository, { priceCents: 777 });

    const sale = await createSale(repository, {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 2 }],
    });

    expect(sale.items[0]?.unitPriceCents).toBe(777);
    expect(sale.items[0]?.subtotalCents).toBe(1554);
  });

  it("rejects an unknown product and leaves stock untouched", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository, { stockQuantity: 3 });

    await expect(
      createSale(repository, {
        userId: USER_ID,
        items: [{ productId: randomUUID(), quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    expect(repository.products.get(product.id)?.stockQuantity).toBe(3);
    expect(repository.sales.size).toBe(0);
    expect(repository.movements).toHaveLength(0);
  });

  it("rejects insufficient stock with the available quantity", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository, { stockQuantity: 1 });

    const error = await createSale(repository, {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 2 }],
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).code).toBe("INSUFFICIENT_STOCK");
    expect((error as Error).message).toContain("1 in stock");
    expect(repository.sales.size).toBe(0);
  });

  it("rolls back every item when one line has no stock", async () => {
    const repository = new InMemorySaleRepository();
    const available = seedProduct(repository, { stockQuantity: 5 });
    const scarce = seedProduct(repository, { stockQuantity: 1 });

    await expect(
      createSale(repository, {
        userId: USER_ID,
        items: [
          { productId: available.id, quantity: 2 },
          { productId: scarce.id, quantity: 4 },
        ],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(repository.products.get(available.id)?.stockQuantity).toBe(5);
    expect(repository.products.get(scarce.id)?.stockQuantity).toBe(1);
  });

  it("rejects an empty item list", async () => {
    const repository = new InMemorySaleRepository();

    await expect(
      createSale(repository, { userId: USER_ID, items: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.startedTransactions).toBe(0);
  });

  it("rejects repeated products in one sale", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository);

    await expect(
      createSale(repository, {
        userId: USER_ID,
        items: [
          { productId: product.id, quantity: 1 },
          { productId: product.id, quantity: 2 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([0, -1, 1.5])("rejects quantity %s", async (quantity) => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository);

    await expect(
      createSale(repository, {
        userId: USER_ID,
        items: [{ productId: product.id, quantity }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("cancelSale", () => {
  async function saleWithStock(): Promise<{
    repository: InMemorySaleRepository;
    product: Product;
    saleId: string;
  }> {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository, { stockQuantity: 5 });
    const sale = await createSale(repository, {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 2 }],
    });
    return { repository, product, saleId: sale.id };
  }

  it("restores stock, marks the sale cancelled and records movements", async () => {
    const { repository, product, saleId } = await saleWithStock();
    const cancelledAt = Date.now() + 1000;

    const cancelled = await cancelSale(repository, saleId, cancelledAt);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.updatedAt).toBe(cancelledAt);
    expect(cancelled.createdAt).not.toBe(cancelledAt);
    expect(repository.products.get(product.id)?.stockQuantity).toBe(5);
    const cancellation = repository.movements.filter((m) => m.type === "CANCELLATION");
    expect(cancellation).toHaveLength(1);
    expect(cancellation[0]).toMatchObject({ productId: product.id, quantity: 2 });
  });

  it("throws SALE_NOT_FOUND for an unknown sale", async () => {
    const repository = new InMemorySaleRepository();
    const id = randomUUID();

    const error = await cancelSale(repository, id).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SaleNotFoundError);
    expect((error as SaleNotFoundError).code).toBe("SALE_NOT_FOUND");
  });

  it("refuses to cancel twice", async () => {
    const { repository, product, saleId } = await saleWithStock();
    await cancelSale(repository, saleId);

    const error = await cancelSale(repository, saleId).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(SaleAlreadyCancelledError);
    expect((error as SaleAlreadyCancelledError).code).toBe("CONFLICT");
    expect(repository.products.get(product.id)?.stockQuantity).toBe(5);
  });
});

describe("getSale", () => {
  it("returns the sale with its items", async () => {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository);
    const created = await createSale(repository, {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 1 }],
    });

    const found = await getSale(repository, created.id);

    expect(found.id).toBe(created.id);
    expect(found.items).toEqual(created.items);
  });

  it("throws SALE_NOT_FOUND when missing", async () => {
    const repository = new InMemorySaleRepository();

    await expect(getSale(repository, randomUUID())).rejects.toBeInstanceOf(
      SaleNotFoundError,
    );
  });
});

describe("listSales", () => {
  async function seed(): Promise<InMemorySaleRepository> {
    const repository = new InMemorySaleRepository();
    const product = seedProduct(repository, { stockQuantity: 100 });
    for (let i = 0; i < 5; i += 1) {
      await createSale(repository, {
        userId: USER_ID,
        items: [{ productId: product.id, quantity: i + 1 }],
      });
    }
    return repository;
  }

  it("computes pagination", async () => {
    const repository = await seed();

    const page = await listSales(repository, {
      page: 2,
      limit: 2,
      sort: "createdAt",
      order: "asc",
    });

    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.sales).toHaveLength(2);
  });

  it("filters by status", async () => {
    const repository = await seed();
    const [first] = (
      await repository.list({ page: 1, limit: 1, sort: "createdAt", order: "asc" })
    ).rows;
    if (!first) throw new Error("no sale seeded");
    await cancelSale(repository, first.id);

    const page = await listSales(repository, {
      page: 1,
      limit: 10,
      status: "CANCELLED",
      sort: "createdAt",
      order: "asc",
    });

    expect(page.total).toBe(1);
    expect(page.sales[0]?.id).toBe(first.id);
  });

  it("returns an empty page when nothing matches", async () => {
    const repository = await seed();

    const page = await listSales(repository, {
      page: 1,
      limit: 10,
      customerId: randomUUID(),
      sort: "totalCents",
      order: "desc",
    });

    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(0);
    expect(page.sales).toEqual([]);
  });
});
