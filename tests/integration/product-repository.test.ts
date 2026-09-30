import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreatedDependencies } from "../../src/infrastructure/dependencies.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";
import { loadEnv } from "../../src/config/env.js";
import type { PostgresDatabase } from "../../src/infrastructure/database/postgres.js";
import { SqliteDatabase } from "../../src/infrastructure/database/sqlite.js";
import * as sqliteSchema from "../../src/infrastructure/database/schema/sqlite.js";
import * as pgSchema from "../../src/infrastructure/database/schema/postgres.js";
import type { Product } from "../../src/domain/entities/product.js";
import type { ProductRepository } from "../../src/application/ports/product-repository.js";
import { ConflictError } from "../../src/domain/errors/domain-error.js";

/**
 * Repository behavior must hold on every supported engine, so this suite
 * runs against SQLite always and against PostgreSQL when TEST_POSTGRES_URL is
 * configured (always in CI — see tests/setup.ts).
 */

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

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

async function insertMovement(
  database: SqliteDatabase | PostgresDatabase,
  productId: string,
): Promise<string> {
  const movement = {
    id: randomUUID(),
    productId,
    type: "PURCHASE",
    quantity: 10,
    reason: null,
    createdAt: Date.now(),
  };
  if (database instanceof SqliteDatabase) {
    await database.context.guard(async () => {
      await database.context.db
        .insert(sqliteSchema.inventoryMovements)
        .values(movement);
    });
    return movement.id;
  }
  await database.context.db.insert(pgSchema.inventoryMovements).values(movement);
  return movement.id;
}

async function deleteMovement(
  database: SqliteDatabase | PostgresDatabase,
  movementId: string,
): Promise<void> {
  if (database instanceof SqliteDatabase) {
    await database.context.guard(async () => {
      await database.context.db
        .delete(sqliteSchema.inventoryMovements)
        .where(eq(sqliteSchema.inventoryMovements.id, movementId));
    });
    return;
  }
  await database.context.db
    .delete(pgSchema.inventoryMovements)
    .where(eq(pgSchema.inventoryMovements.id, movementId));
}

describe.each(targets())("product repository ($name)", (target) => {
  let created: CreatedDependencies;
  let repository: ProductRepository;
  const insertedProductIds: string[] = [];
  const insertedMovementIds: string[] = [];

  beforeAll(async () => {
    created = await createDependencies({
      ...loadEnv(),
      DATABASE_URL: target.databaseUrl,
    });
    repository = created.dependencies.products;
  });

  afterAll(async () => {
    // Best-effort cleanup keeps the shared PostgreSQL test database tidy:
    // movements first (they block product deletion via foreign keys).
    for (const id of insertedMovementIds) {
      await deleteMovement(created.database, id).catch(() => undefined);
    }
    for (const id of insertedProductIds) {
      await repository.delete(id).catch(() => undefined);
    }
    await created.close();
  });

  function track(product: Product): Product {
    insertedProductIds.push(product.id);
    return product;
  }

  it("inserts and reads back by id and sku", async () => {
    const product = track(makeProduct());
    await repository.insert(product);

    expect(await repository.findById(product.id)).toEqual(product);
    expect(await repository.findBySku(product.sku)).toEqual(product);
  });

  it("returns null for unknown id and sku", async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
    expect(await repository.findBySku(`MISSING-${randomUUID()}`)).toBeNull();
  });

  it("rejects a duplicate SKU with ConflictError", async () => {
    const sku = `SKU-${randomUUID()}`;
    await repository.insert(track(makeProduct({ sku })));

    await expect(repository.insert(makeProduct({ sku }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("paginates, sorts and computes total", async () => {
    const token = `R${randomUUID().slice(0, 8)}`;
    for (const [name, priceCents] of [
      ["alpha", 300],
      ["beta", 100],
      ["gamma", 200],
    ] as const) {
      await repository.insert(
        track(makeProduct({ name: `${token} ${name}`, priceCents })),
      );
    }

    const page = await repository.list({
      page: 1,
      limit: 2,
      search: token,
      sort: "price",
      order: "desc",
    });

    expect(page.total).toBe(3);
    expect(page.rows.map((row) => row.priceCents)).toEqual([300, 200]);

    const secondPage = await repository.list({
      page: 2,
      limit: 2,
      search: token,
      sort: "price",
      order: "desc",
    });
    expect(secondPage.rows.map((row) => row.priceCents)).toEqual([100]);
  });

  it("searches case-insensitively and treats LIKE wildcards literally", async () => {
    const token = `S${randomUUID().slice(0, 8)}`;
    await repository.insert(track(makeProduct({ name: `${token} 50% Special` })));
    await repository.insert(track(makeProduct({ name: `${token} plain` })));

    const upper = await repository.list({
      page: 1,
      limit: 10,
      search: token.toUpperCase(),
      sort: "name",
      order: "asc",
    });
    expect(upper.total).toBe(2);

    const wildcard = await repository.list({
      page: 1,
      limit: 10,
      search: "50%",
      sort: "name",
      order: "asc",
    });
    // A non-escaped pattern would match every row in the table.
    expect(wildcard.total).toBe(1);
    expect(wildcard.rows[0]?.name).toBe(`${token} 50% Special`);
  });

  it("updates a product", async () => {
    const product = track(makeProduct());
    await repository.insert(product);

    const updated: Product = {
      ...product,
      name: "Updated name",
      priceCents: 4242,
      updatedAt: Date.now() + 1,
    };
    await repository.update(updated);

    expect(await repository.findById(product.id)).toEqual(updated);
  });

  it("deletes a product", async () => {
    const product = track(makeProduct());
    await repository.insert(product);

    await repository.delete(product.id);

    expect(await repository.findById(product.id)).toBeNull();
  });

  it("rejects deleting a product that is still referenced", async () => {
    const product = track(makeProduct({ stockQuantity: 0 }));
    await repository.insert(product);
    insertedMovementIds.push(await insertMovement(created.database, product.id));

    await expect(repository.delete(product.id)).rejects.toBeInstanceOf(ConflictError);
  });
});
