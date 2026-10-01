import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adjustStock } from "../../src/application/inventory/adjust-stock.js";
import { listMovements } from "../../src/application/inventory/list-movements.js";
import type { InventoryRepository } from "../../src/application/ports/inventory-repository.js";
import { loadEnv } from "../../src/config/env.js";
import { ProductNotFoundError } from "../../src/domain/entities/product.js";
import { InsufficientStockError } from "../../src/domain/entities/sale.js";
import { PostgresDatabase } from "../../src/infrastructure/database/postgres.js";
import * as pgSchema from "../../src/infrastructure/database/schema/postgres.js";
import * as sqliteSchema from "../../src/infrastructure/database/schema/sqlite.js";
import type { SqliteDatabase } from "../../src/infrastructure/database/sqlite.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";
import type { Dependencies } from "../../src/application/dependencies.js";

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

type Database = SqliteDatabase | PostgresDatabase;

async function deleteProductRows(database: Database, productId: string): Promise<void> {
  if (database instanceof PostgresDatabase) {
    const db = database.context.db;
    await db
      .delete(pgSchema.saleItems)
      .where(eq(pgSchema.saleItems.productId, productId));
    await db
      .delete(pgSchema.inventoryMovements)
      .where(eq(pgSchema.inventoryMovements.productId, productId));
    await db.delete(pgSchema.products).where(eq(pgSchema.products.id, productId));
    return;
  }

  const ctx = database.context;
  await ctx.guard(async () => {
    await ctx.db
      .delete(sqliteSchema.saleItems)
      .where(eq(sqliteSchema.saleItems.productId, productId));
    await ctx.db
      .delete(sqliteSchema.inventoryMovements)
      .where(eq(sqliteSchema.inventoryMovements.productId, productId));
    await ctx.db
      .delete(sqliteSchema.products)
      .where(eq(sqliteSchema.products.id, productId));
  });
}

describe.each(targets())("inventory repository ($name)", ({ databaseUrl }) => {
  let dependencies: Dependencies;
  let inventory: InventoryRepository;
  let database: Database;
  let close: () => Promise<void>;
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
    inventory = dependencies.inventory;
    database = created.database;
    close = created.close;
  });

  afterAll(async () => {
    for (const id of productIds) {
      await deleteProductRows(database, id);
    }
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
      priceCents: 1000,
      stockQuantity,
      categoryId: null,
      createdAt: now,
      updatedAt: now,
    });
    productIds.push(id);
    return id;
  }

  it("applies a purchase and appends to the ledger", async () => {
    const productId = await insertProduct(2);

    const movement = await adjustStock(inventory, {
      productId,
      quantity: 5,
      type: "PURCHASE",
      reason: "Restock",
    });

    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(7);
    expect(movement.type).toBe("PURCHASE");

    const page = await listMovements(inventory, {
      page: 1,
      limit: 10,
      productId,
      sort: "createdAt",
      order: "asc",
    });
    expect(page.total).toBe(1);
    expect(page.movements[0]?.reason).toBe("Restock");
  });

  it("applies a negative adjustment", async () => {
    const productId = await insertProduct(5);

    await adjustStock(inventory, { productId, quantity: -2, type: "ADJUSTMENT" });

    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(3);
  });

  it("never drives stock negative and rolls the ledger back", async () => {
    const productId = await insertProduct(1);

    await expect(
      adjustStock(inventory, { productId, quantity: -5, type: "ADJUSTMENT" }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(1);
    const page = await listMovements(inventory, {
      page: 1,
      limit: 10,
      productId,
      sort: "createdAt",
      order: "asc",
    });
    expect(page.total).toBe(0);
  });

  it("rejects an unknown product", async () => {
    await expect(
      adjustStock(inventory, {
        productId: randomUUID(),
        quantity: 1,
        type: "PURCHASE",
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("serializes concurrent adjustments without losing updates", async () => {
    const productId = await insertProduct(0);

    await Promise.all(
      Array.from({ length: 5 }, () =>
        adjustStock(inventory, { productId, quantity: 2, type: "PURCHASE" }),
      ),
    );

    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(10);
    const page = await listMovements(inventory, {
      page: 1,
      limit: 10,
      productId,
      sort: "createdAt",
      order: "asc",
    });
    expect(page.total).toBe(5);
  });

  it("refuses concurrent removals beyond the available stock", async () => {
    const productId = await insertProduct(1);

    const results = await Promise.allSettled([
      adjustStock(inventory, { productId, quantity: -1, type: "ADJUSTMENT" }),
      adjustStock(inventory, { productId, quantity: -1, type: "ADJUSTMENT" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(0);
  });

  it("lists the ledger across sales and purchases with filters", async () => {
    const productId = await insertProduct(10);
    await adjustStock(inventory, { productId, quantity: 3, type: "PURCHASE" });
    await adjustStock(inventory, { productId, quantity: -1, type: "RETURN" });

    const all = await listMovements(inventory, {
      page: 1,
      limit: 10,
      productId,
      sort: "createdAt",
      order: "asc",
    });
    expect(all.total).toBe(2);

    const salesOnly = await listMovements(inventory, {
      page: 1,
      limit: 10,
      type: "RETURN",
      sort: "quantity",
      order: "desc",
    });
    expect(salesOnly.total).toBeGreaterThanOrEqual(1);
    expect(salesOnly.movements.every((movement) => movement.type === "RETURN")).toBe(
      true,
    );
  });
});
