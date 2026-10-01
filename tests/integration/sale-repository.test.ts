import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Dependencies } from "../../src/application/dependencies.js";
import type { SaleRepository } from "../../src/application/ports/sale-repository.js";
import { createCustomer } from "../../src/application/customers/create-customer.js";
import { cancelSale } from "../../src/application/sales/cancel-sale.js";
import { createSale } from "../../src/application/sales/create-sale.js";
import { listSales } from "../../src/application/sales/list-sales.js";
import { loadEnv } from "../../src/config/env.js";
import { ProductNotFoundError } from "../../src/domain/entities/product.js";
import {
  InsufficientStockError,
  type SaleWithItems,
} from "../../src/domain/entities/sale.js";
import { PostgresDatabase } from "../../src/infrastructure/database/postgres.js";
import * as pgSchema from "../../src/infrastructure/database/schema/postgres.js";
import * as sqliteSchema from "../../src/infrastructure/database/schema/sqlite.js";
import type { SqliteDatabase } from "../../src/infrastructure/database/sqlite.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

type Database = SqliteDatabase | PostgresDatabase;

interface MovementRow {
  type: string;
  quantity: number;
}

async function readMovements(
  database: Database,
  productId: string,
): Promise<MovementRow[]> {
  if (database instanceof PostgresDatabase) {
    const db = database.context.db;
    return await db
      .select({
        type: pgSchema.inventoryMovements.type,
        quantity: pgSchema.inventoryMovements.quantity,
      })
      .from(pgSchema.inventoryMovements)
      .where(eq(pgSchema.inventoryMovements.productId, productId));
  }

  const ctx = database.context;
  return await ctx.guard(async () =>
    ctx.db
      .select({
        type: sqliteSchema.inventoryMovements.type,
        quantity: sqliteSchema.inventoryMovements.quantity,
      })
      .from(sqliteSchema.inventoryMovements)
      .where(eq(sqliteSchema.inventoryMovements.productId, productId)),
  );
}

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

describe.each(targets())("sale repository ($name)", ({ databaseUrl }) => {
  let dependencies: Dependencies;
  let sales: SaleRepository;
  let database: Database;
  let close: () => Promise<void>;
  const productIds: string[] = [];
  let userId: string;
  let customerId: string;

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
    sales = dependencies.sales;
    database = created.database;
    close = created.close;

    const user = {
      id: randomUUID(),
      email: `cashier-${randomUUID()}@test.pos`,
      name: "Test Cashier",
      passwordHash: null,
      role: "CASHIER" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await dependencies.users.insert(user);
    userId = user.id;
    customerId = (
      await createCustomer(dependencies.customers, { name: "Test Customer" })
    ).id;
  });

  afterAll(async () => {
    for (const id of productIds) {
      await deleteProductRows(database, id);
    }
    await close();
  });

  async function insertProduct(
    stockQuantity: number,
    priceCents = 1000,
  ): Promise<string> {
    const id = randomUUID();
    const now = Date.now();
    await dependencies.products.insert({
      id,
      sku: `SKU-${randomUUID()}`,
      name: "Keyboard",
      description: null,
      priceCents,
      stockQuantity,
      categoryId: null,
      createdAt: now,
      updatedAt: now,
    });
    productIds.push(id);
    return id;
  }

  it("persists the sale, its items and the stock decrement atomically", async () => {
    const productId = await insertProduct(5, 2500);

    const sale = await createSale(dependencies.sales, {
      userId,
      customerId,
      items: [{ productId, quantity: 2 }],
    });

    const stored = await sales.findById(sale.id);
    expect(stored?.status).toBe("COMPLETED");
    expect(stored?.totalCents).toBe(5000);
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0]?.unitPriceCents).toBe(2500);
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(3);
    expect(
      (await readMovements(database, productId)).filter((m) => m.type === "SALE"),
    ).toHaveLength(1);
  });

  it("rolls back every write when one line lacks stock", async () => {
    const available = await insertProduct(5);
    const scarce = await insertProduct(1);

    await expect(
      createSale(dependencies.sales, {
        userId,
        items: [
          { productId: available, quantity: 2 },
          { productId: scarce, quantity: 3 },
        ],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect((await dependencies.products.findById(available))?.stockQuantity).toBe(5);
    expect((await dependencies.products.findById(scarce))?.stockQuantity).toBe(1);
  });

  it("never oversells under concurrent sales", async () => {
    const productId = await insertProduct(1);

    const results = await Promise.allSettled([
      createSale(dependencies.sales, { userId, items: [{ productId, quantity: 1 }] }),
      createSale(dependencies.sales, { userId, items: [{ productId, quantity: 1 }] }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(0);
  });

  it("rejects an unknown product", async () => {
    await expect(
      createSale(dependencies.sales, {
        userId,
        items: [{ productId: randomUUID(), quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("restores stock and records a CANCELLATION movement", async () => {
    const productId = await insertProduct(4);
    const sale = await createSale(dependencies.sales, {
      userId,
      items: [{ productId, quantity: 3 }],
    });

    const cancelled = await cancelSale(sales, sale.id);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.totalCents).toBe(sale.totalCents);
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(4);
    const cancellations = (await readMovements(database, productId)).filter(
      (movement) => movement.type === "CANCELLATION",
    );
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0]?.quantity).toBe(3);
  });

  it("refuses to cancel twice", async () => {
    const productId = await insertProduct(2);
    const sale = await createSale(dependencies.sales, {
      userId,
      items: [{ productId, quantity: 1 }],
    });
    await cancelSale(sales, sale.id);

    await expect(cancelSale(sales, sale.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await dependencies.products.findById(productId))?.stockQuantity).toBe(2);
  });

  it("filters, sorts and paginates", async () => {
    const productId = await insertProduct(50);
    const created: SaleWithItems[] = [];
    for (let i = 0; i < 3; i += 1) {
      created.push(
        await createSale(dependencies.sales, {
          userId,
          items: [{ productId, quantity: 1 }],
        }),
      );
    }
    const cancelledId = created[0]?.id;
    if (!cancelledId) throw new Error("no sale created");
    await cancelSale(sales, cancelledId);

    const all = await listSales(sales, {
      page: 1,
      limit: 100,
      sort: "createdAt",
      order: "desc",
    });
    expect(all.total).toBeGreaterThanOrEqual(4);

    const completed = await listSales(sales, {
      page: 1,
      limit: 100,
      status: "COMPLETED",
      sort: "createdAt",
      order: "asc",
    });
    expect(completed.sales.every((sale) => sale.status === "COMPLETED")).toBe(true);
    expect(completed.sales.some((sale) => sale.id === cancelledId)).toBe(false);

    const byCustomer = await listSales(sales, {
      page: 1,
      limit: 100,
      customerId,
      sort: "createdAt",
      order: "asc",
    });
    expect(byCustomer.total).toBeGreaterThanOrEqual(1);
    expect(byCustomer.sales.every((sale) => sale.customerId === customerId)).toBe(true);

    const page = await listSales(sales, {
      page: 1,
      limit: 2,
      sort: "createdAt",
      order: "asc",
    });
    expect(page.sales).toHaveLength(2);
    expect(page.totalPages).toBe(Math.ceil(page.total / 2));
  });

  it("refuses to delete a product referenced by a sale", async () => {
    const productId = await insertProduct(3);
    await createSale(dependencies.sales, {
      userId,
      items: [{ productId, quantity: 1 }],
    });

    await expect(dependencies.products.delete(productId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
