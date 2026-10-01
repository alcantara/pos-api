import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Product } from "../../domain/entities/product.js";
import {
  IdempotencyKeyConflictError,
  IdempotencyKeyTakenError,
  type IdempotencyRecord,
} from "../../domain/entities/idempotency.js";
import type {
  IdempotencyScope,
  IdempotencyStore,
} from "../ports/idempotency-repository.js";
import type { MovementDraft, StockChange } from "../ports/inventory-repository.js";
import type {
  ListSalesParams,
  PagedSales,
  SaleRepository,
  SaleWriteContext,
} from "../ports/sale-repository.js";
import {
  createSaleIdempotently,
  requestFingerprint,
} from "./create-sale-idempotently.js";

const USER_ID = randomUUID();

function makeProduct(overrides: Partial<Product> = {}): Product {
  const now = Date.now();
  return {
    id: randomUUID(),
    sku: `SKU-${randomUUID()}`,
    name: "Keyboard",
    description: null,
    priceCents: 1000,
    stockQuantity: 100,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * In-memory stand-in that reproduces the two behaviours the real
 * implementations rely on: writes roll back on error, and a claimed key is
 * unique per user.
 */
class FakeStore implements SaleRepository, IdempotencyStore {
  products = new Map<string, Product>();
  sales = new Map<string, Awaited<ReturnType<SaleRepository["findById"]>>>();
  records = new Map<string, IdempotencyRecord>();
  movements: string[] = [];
  /** Set by the race test to hold the winner inside the claim. */
  gate: Promise<void> | null = null;
  /** Resolves when a transaction commits, mirroring the unique index blocking. */
  private committed = deferred();

  find(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    return Promise.resolve(this.records.get(`${scope.userId}:${scope.key}`) ?? null);
  }

  findById(id: string) {
    return Promise.resolve(this.sales.get(id) ?? null);
  }

  list(_params: ListSalesParams): Promise<PagedSales> {
    return Promise.resolve({ rows: [], total: 0 });
  }

  seed(product: Product): Product {
    this.products.set(product.id, product);
    return product;
  }

  async transaction<T>(fn: (ctx: SaleWriteContext) => Promise<T>): Promise<T> {
    // Rollback must undo only what this transaction wrote: restoring a whole
    // snapshot would also erase rows a concurrent winner committed after the
    // snapshot was taken, which a real database never does.
    const productsBefore = new Map(this.products);
    const movementsBefore = [...this.movements];
    const touchedProducts = new Set<string>();
    const writtenSales = new Set<string>();
    const writtenRecords = new Set<string>();

    const ctx: SaleWriteContext = {
      findProductsForUpdate: (ids) =>
        Promise.resolve(
          ids.flatMap((id) => (this.products.get(id) ? [this.products.get(id)!] : [])),
        ),

      findSaleForUpdate: (id) => Promise.resolve(this.sales.get(id) ?? null),

      insertSale: (sale) => {
        writtenSales.add(sale.id);
        this.sales.set(sale.id, { ...sale, items: [] });
        return Promise.resolve();
      },

      insertSaleItems: (items) => {
        for (const item of items) {
          const sale = this.sales.get(item.saleId);
          if (!sale) return Promise.reject(new Error("sale missing"));
          sale.items.push(item);
        }
        return Promise.resolve();
      },

      updateSale: (sale) => {
        const existing = this.sales.get(sale.id);
        if (!existing) return Promise.reject(new Error("sale missing"));
        this.sales.set(sale.id, { ...sale, items: existing.items });
        return Promise.resolve();
      },

      applyStockChanges: (changes: StockChange[]) => {
        for (const change of changes) {
          const product = this.products.get(change.productId);
          if (!product) return Promise.reject(new Error("product missing"));
          touchedProducts.add(change.productId);
          this.products.set(change.productId, {
            ...product,
            stockQuantity: product.stockQuantity + change.delta,
          });
        }
        return Promise.resolve();
      },

      recordMovements: (recordsToInsert: MovementDraft[]) => {
        for (const record of recordsToInsert) {
          this.movements.push(record.type);
        }
        return Promise.resolve();
      },

      claimIdempotency: async (claim) => {
        const scoped = `${claim.userId}:${claim.key}`;
        if (this.records.has(scoped)) {
          // The real implementations block here until the winner commits, which
          // is why the caller can read the committed resource afterwards.
          await this.committed.promise;
          throw new IdempotencyKeyTakenError(claim.key);
        }
        writtenRecords.add(scoped);
        this.records.set(scoped, claim);
        if (this.gate) await this.gate;
      },
    };

    try {
      const result = await fn(ctx);
      this.committed.resolve();
      return result;
    } catch (error) {
      for (const id of touchedProducts) {
        const before = productsBefore.get(id);
        if (before) this.products.set(id, before);
      }
      for (const id of writtenSales) this.sales.delete(id);
      for (const scoped of writtenRecords) this.records.delete(scoped);
      this.movements = movementsBefore;
      throw error;
    }
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("requestFingerprint", () => {
  it("is stable regardless of key order", () => {
    const left = requestFingerprint({
      items: [{ productId: "a", quantity: 1 }],
      customerId: null,
    });
    const right = requestFingerprint({
      customerId: null,
      items: [{ quantity: 1, productId: "a" }],
    });

    expect(left).toBe(right);
  });

  it("distinguishes different payloads", () => {
    const left = requestFingerprint({ items: [{ productId: "a", quantity: 1 }] });
    const right = requestFingerprint({ items: [{ productId: "a", quantity: 2 }] });

    expect(left).not.toBe(right);
  });
});

describe("createSaleIdempotently", () => {
  it("creates the sale on the first request", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());

    const outcome = await createSaleIdempotently(
      store,
      store,
      { userId: USER_ID, items: [{ productId: product.id, quantity: 2 }] },
      { idempotencyKey: "key-1" },
    );

    expect(outcome.replayed).toBe(false);
    expect(outcome.sale.totalCents).toBe(2000);
    expect(store.products.get(product.id)?.stockQuantity).toBe(98);
  });

  it("replays the same sale for a repeated key and body", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());
    const input = {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 2 }],
    };

    const first = await createSaleIdempotently(store, store, input, {
      idempotencyKey: "key-1",
    });
    const second = await createSaleIdempotently(store, store, input, {
      idempotencyKey: "key-1",
    });

    expect(second.replayed).toBe(true);
    expect(second.sale.id).toBe(first.sale.id);
    expect(store.sales.size).toBe(1);
    expect(store.products.get(product.id)?.stockQuantity).toBe(98);
    expect(store.movements).toHaveLength(1);
  });

  it("replays even when the body keys arrive in a different order", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());
    const key = { idempotencyKey: "key-1" };

    await createSaleIdempotently(
      store,
      store,
      {
        userId: USER_ID,
        customerId: null,
        items: [{ productId: product.id, quantity: 1 }],
      },
      key,
    );
    const second = await createSaleIdempotently(
      store,
      store,
      {
        items: [{ productId: product.id, quantity: 1 }],
        customerId: null,
        userId: USER_ID,
      },
      key,
    );

    expect(second.replayed).toBe(true);
  });

  it("rejects the same key with a different body", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());
    const key = { idempotencyKey: "key-1" };

    await createSaleIdempotently(
      store,
      store,
      { userId: USER_ID, items: [{ productId: product.id, quantity: 1 }] },
      key,
    );

    await expect(
      createSaleIdempotently(
        store,
        store,
        { userId: USER_ID, items: [{ productId: product.id, quantity: 5 }] },
        key,
      ),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
    expect(store.sales.size).toBe(1);
    expect(store.products.get(product.id)?.stockQuantity).toBe(99);
  });

  it("scopes keys per user", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());
    const other = randomUUID();
    const key = { idempotencyKey: "shared-key" };

    const first = await createSaleIdempotently(
      store,
      store,
      { userId: USER_ID, items: [{ productId: product.id, quantity: 1 }] },
      key,
    );
    const second = await createSaleIdempotently(
      store,
      store,
      { userId: other, items: [{ productId: product.id, quantity: 1 }] },
      key,
    );

    expect(second.replayed).toBe(false);
    expect(second.sale.id).not.toBe(first.sale.id);
  });

  it("creates exactly one sale when two requests race on the same key", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());
    const gate = deferred();
    store.gate = gate.promise;

    const input = {
      userId: USER_ID,
      items: [{ productId: product.id, quantity: 3 }],
    };
    const options = { idempotencyKey: "key-race" };

    const first = createSaleIdempotently(store, store, input, options);
    const second = createSaleIdempotently(store, store, input, options);
    // Let the second request reach the claim before the first one completes.
    await Promise.resolve();
    gate.resolve();

    const [left, right] = await Promise.all([first, second]);

    expect(left.sale.id).toBe(right.sale.id);
    expect([left.replayed, right.replayed].filter(Boolean)).toHaveLength(1);
    expect(store.sales.size).toBe(1);
    expect(store.products.get(product.id)?.stockQuantity).toBe(97);
  });

  it("rolls the key back when the sale itself fails", async () => {
    const store = new FakeStore();
    const input = {
      userId: USER_ID,
      items: [{ productId: randomUUID(), quantity: 1 }],
    };

    await expect(
      createSaleIdempotently(store, store, input, { idempotencyKey: "key-fail" }),
    ).rejects.toThrow();
    expect(store.records.size).toBe(0);

    // The key is reusable once the failed request is retried with a good body.
    const product = store.seed(makeProduct());
    const retry = await createSaleIdempotently(
      store,
      store,
      { userId: USER_ID, items: [{ productId: product.id, quantity: 1 }] },
      { idempotencyKey: "key-fail" },
    );
    expect(retry.replayed).toBe(false);
  });

  it("behaves like createSale without a key", async () => {
    const store = new FakeStore();
    const product = store.seed(makeProduct());
    const input = { userId: USER_ID, items: [{ productId: product.id, quantity: 1 }] };

    const first = await createSaleIdempotently(store, store, input);
    const second = await createSaleIdempotently(store, store, input);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(store.sales.size).toBe(2);
  });
});
