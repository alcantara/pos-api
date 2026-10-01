import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Dependencies } from "../../src/application/dependencies.js";
import { createSaleIdempotently } from "../../src/application/sales/create-sale-idempotently.js";
import { loadEnv } from "../../src/config/env.js";
import { IdempotencyKeyConflictError } from "../../src/domain/entities/idempotency.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";
import type { Role } from "../../src/domain/entities/user.js";

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

describe.each(targets())("idempotent sales ($name)", ({ databaseUrl }) => {
  let dependencies: Dependencies;
  let close: () => Promise<void>;
  let userId: string;
  let otherUserId: string;
  const productIds: string[] = [];

  beforeAll(async () => {
    const created = await createDependencies(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: databaseUrl,
      }),
    );
    dependencies = created.dependencies;
    close = created.close;

    for (const role of ["MANAGER", "CASHIER"] as Role[]) {
      const user = {
        id: randomUUID(),
        email: `${role.toLowerCase()}-idem-${randomUUID()}@test.pos`,
        name: `Test ${role}`,
        passwordHash: null,
        role,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await dependencies.users.insert(user);
      if (role === "MANAGER") userId = user.id;
      else otherUserId = user.id;
    }
  });

  afterAll(async () => {
    await close();
  });

  async function insertProduct(stockQuantity: number): Promise<string> {
    const id = randomUUID();
    const now = Date.now();
    await dependencies.products.insert({
      id,
      sku: `SKU-${randomUUID()}`,
      name: "Keyboard",
      description: null,
      priceCents: 1500,
      stockQuantity,
      categoryId: null,
      createdAt: now,
      updatedAt: now,
    });
    productIds.push(id);
    return id;
  }

  it("stores the key with the sale it created", async () => {
    const productId = await insertProduct(10);
    const key = `key-${randomUUID()}`;

    const outcome = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      { userId, items: [{ productId, quantity: 1 }] },
      { idempotencyKey: key },
    );

    const record = await dependencies.idempotency.find({ userId, key });
    expect(record?.resourceId).toBe(outcome.sale.id);
    expect(record?.requestHash).toHaveLength(64);
  });

  it("replays the same sale instead of charging twice", async () => {
    const productId = await insertProduct(10);
    const key = `key-${randomUUID()}`;
    const input = { userId, items: [{ productId, quantity: 3 }] };

    const first = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      input,
      { idempotencyKey: key },
    );
    const second = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      input,
      { idempotencyKey: key },
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.sale.id).toBe(first.sale.id);
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(7);
  });

  it("rejects the same key with a different body", async () => {
    const productId = await insertProduct(10);
    const key = `key-${randomUUID()}`;

    await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      { userId, items: [{ productId, quantity: 1 }] },
      { idempotencyKey: key },
    );

    await expect(
      createSaleIdempotently(
        dependencies.sales,
        dependencies.idempotency,
        { userId, items: [{ productId, quantity: 4 }] },
        { idempotencyKey: key },
      ),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);

    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(9);
  });

  it("lets a different user reuse the same key", async () => {
    const productId = await insertProduct(10);
    const key = `key-${randomUUID()}`;

    const first = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      { userId, items: [{ productId, quantity: 1 }] },
      { idempotencyKey: key },
    );
    const second = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      { userId: otherUserId, items: [{ productId, quantity: 1 }] },
      { idempotencyKey: key },
    );

    expect(second.replayed).toBe(false);
    expect(second.sale.id).not.toBe(first.sale.id);
    expect(second.sale.userId).toBe(otherUserId);
  });

  it("creates exactly one sale for concurrent requests with the same key", async () => {
    const productId = await insertProduct(10);
    const key = `key-${randomUUID()}`;
    const input = { userId, items: [{ productId, quantity: 2 }] };

    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () =>
        createSaleIdempotently(dependencies.sales, dependencies.idempotency, input, {
          idempotencyKey: key,
        }),
      ),
    );

    const ids = new Set(outcomes.map((outcome) => outcome.sale.id));
    expect(ids.size).toBe(1);
    expect(outcomes.filter((outcome) => !outcome.replayed)).toHaveLength(1);
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(8);
  });

  it("does not burn the key when the sale is rejected", async () => {
    const key = `key-${randomUUID()}`;
    const input = { userId, items: [{ productId: randomUUID(), quantity: 1 }] };

    await expect(
      createSaleIdempotently(dependencies.sales, dependencies.idempotency, input, {
        idempotencyKey: key,
      }),
    ).rejects.toThrow();
    expect(await dependencies.idempotency.find({ userId, key })).toBeNull();

    const productId = await insertProduct(5);
    const retry = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      { userId, items: [{ productId, quantity: 1 }] },
      { idempotencyKey: key },
    );
    expect(retry.replayed).toBe(false);
  });

  it("treats a missing key as a plain sale", async () => {
    const productId = await insertProduct(10);
    const input = { userId, items: [{ productId, quantity: 1 }] };

    const first = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      input,
    );
    const second = await createSaleIdempotently(
      dependencies.sales,
      dependencies.idempotency,
      input,
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(second.sale.id).not.toBe(first.sale.id);
  });
});
