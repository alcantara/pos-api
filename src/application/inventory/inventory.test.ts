import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProductNotFoundError } from "../../domain/entities/product.js";
import { InsufficientStockError } from "../../domain/entities/sale.js";
import type { Product } from "../../domain/entities/product.js";
import type { InventoryMovement } from "../../domain/entities/sale.js";
import type {
  InventoryRepository,
  InventoryWriteContext,
  ListMovementsParams,
  MovementDraft,
  MovementWriter,
  PagedMovements,
  StockChange,
} from "../ports/inventory-repository.js";
import { adjustStock } from "./adjust-stock.js";
import { listMovements } from "./list-movements.js";

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = Date.now();
  return {
    id: randomUUID(),
    sku: `SKU-${randomUUID()}`,
    name: "Keyboard",
    description: null,
    priceCents: 1000,
    stockQuantity: 10,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class InMemoryInventoryRepository implements InventoryRepository {
  products = new Map<string, Product>();
  ledger: InventoryMovement[] = [];
  transactions = 0;

  movements: MovementWriter = {
    insert: (movements: MovementDraft[]) => {
      for (const movement of movements) {
        this.ledger.push({ id: randomUUID(), ...movement });
      }
      return Promise.resolve();
    },

    list: (params: ListMovementsParams): Promise<PagedMovements> => {
      let rows = [...this.ledger];
      if (params.productId)
        rows = rows.filter((row) => row.productId === params.productId);
      if (params.type) rows = rows.filter((row) => row.type === params.type);
      rows.sort((a, b) =>
        params.sort === "quantity"
          ? a.quantity - b.quantity
          : a.createdAt - b.createdAt,
      );
      if (params.order === "desc") rows.reverse();
      const total = rows.length;
      const offset = (params.page - 1) * params.limit;
      return Promise.resolve({
        rows: rows.slice(offset, offset + params.limit),
        total,
      });
    },
  };

  async transaction<T>(fn: (ctx: InventoryWriteContext) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const products = new Map(this.products);
    const ledger = [...this.ledger];

    try {
      return await fn({
        findProductsForUpdate: (ids) =>
          Promise.resolve(
            ids.flatMap((id) =>
              this.products.get(id) ? [this.products.get(id)!] : [],
            ),
          ),

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
            this.ledger.push({ id: randomUUID(), ...movement });
          }
          return Promise.resolve();
        },
      });
    } catch (error) {
      this.products = products;
      this.ledger = ledger;
      throw error;
    }
  }

  seed(product: Product): Product {
    this.products.set(product.id, product);
    return product;
  }
}

describe("adjustStock", () => {
  it("adds stock on a purchase and records the movement", async () => {
    const repository = new InMemoryInventoryRepository();
    const product = repository.seed(makeProduct({ stockQuantity: 2 }));

    const movement = await adjustStock(repository, {
      productId: product.id,
      quantity: 5,
      type: "PURCHASE",
      reason: "Restock",
    });

    expect(repository.products.get(product.id)?.stockQuantity).toBe(7);
    expect(movement).toMatchObject({
      productId: product.id,
      type: "PURCHASE",
      quantity: 5,
      reason: "Restock",
    });
    expect(repository.ledger).toHaveLength(1);
  });

  it("removes stock on an adjustment and defaults the reason to null", async () => {
    const repository = new InMemoryInventoryRepository();
    const product = repository.seed(makeProduct({ stockQuantity: 5 }));

    const movement = await adjustStock(repository, {
      productId: product.id,
      quantity: -2,
      type: "ADJUSTMENT",
    });

    expect(repository.products.get(product.id)?.stockQuantity).toBe(3);
    expect(movement.reason).toBeNull();
  });

  it("rejects a removal larger than the stock on hand", async () => {
    const repository = new InMemoryInventoryRepository();
    const product = repository.seed(makeProduct({ stockQuantity: 1 }));

    const error = await adjustStock(repository, {
      productId: product.id,
      quantity: -4,
      type: "ADJUSTMENT",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as Error).message).toContain("1 in stock");
    expect(repository.products.get(product.id)?.stockQuantity).toBe(1);
    expect(repository.ledger).toHaveLength(0);
  });

  it("rejects an unknown product", async () => {
    const repository = new InMemoryInventoryRepository();

    await expect(
      adjustStock(repository, {
        productId: randomUUID(),
        quantity: 1,
        type: "PURCHASE",
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("rejects a zero or fractional quantity without opening a transaction", async () => {
    const repository = new InMemoryInventoryRepository();
    const product = repository.seed(makeProduct());

    await expect(
      adjustStock(repository, {
        productId: product.id,
        quantity: 0,
        type: "ADJUSTMENT",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    await expect(
      adjustStock(repository, {
        productId: product.id,
        quantity: 1.5,
        type: "ADJUSTMENT",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(repository.transactions).toBe(0);
  });
});

describe("listMovements", () => {
  function seedLedger(): InMemoryInventoryRepository {
    const repository = new InMemoryInventoryRepository();
    const first = repository.seed(makeProduct());
    const second = repository.seed(makeProduct());
    const base = Date.now();

    repository.ledger.push(
      {
        id: randomUUID(),
        productId: first.id,
        type: "PURCHASE",
        quantity: 10,
        reason: null,
        createdAt: base,
      },
      {
        id: randomUUID(),
        productId: first.id,
        type: "SALE",
        quantity: -3,
        reason: "Sale 1",
        createdAt: base + 10,
      },
      {
        id: randomUUID(),
        productId: second.id,
        type: "ADJUSTMENT",
        quantity: -1,
        reason: "Damage",
        createdAt: base + 20,
      },
    );
    return repository;
  }

  it("computes pagination and filters by product", async () => {
    const repository = seedLedger();
    const [firstProduct] = repository.products.values();
    if (!firstProduct) throw new Error("no product");

    const page = await listMovements(repository, {
      page: 1,
      limit: 1,
      productId: firstProduct.id,
      sort: "createdAt",
      order: "asc",
    });

    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.movements[0]?.type).toBe("PURCHASE");
  });

  it("filters by type", async () => {
    const repository = seedLedger();

    const page = await listMovements(repository, {
      page: 1,
      limit: 10,
      type: "SALE",
      sort: "createdAt",
      order: "asc",
    });

    expect(page.total).toBe(1);
    expect(page.movements[0]?.quantity).toBe(-3);
  });

  it("returns an empty page when nothing matches", async () => {
    const repository = seedLedger();

    const page = await listMovements(repository, {
      page: 1,
      limit: 10,
      productId: randomUUID(),
      sort: "quantity",
      order: "desc",
    });

    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(0);
    expect(page.movements).toEqual([]);
  });
});
