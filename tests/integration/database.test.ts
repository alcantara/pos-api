import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { runMigrations } from "../../src/infrastructure/database/migrate.js";
import { PostgresDatabase } from "../../src/infrastructure/database/postgres.js";
import * as pgSchema from "../../src/infrastructure/database/schema/postgres.js";
import * as sqliteSchema from "../../src/infrastructure/database/schema/sqlite.js";
import type {
  ProductRow,
  SaleItemRow,
  SaleRow,
  UserRow,
} from "../../src/infrastructure/database/rows.js";
import {
  SqliteDatabase,
  type SqliteContext,
} from "../../src/infrastructure/database/sqlite.js";
import type { PgContext } from "../../src/infrastructure/database/postgres.js";

const sqliteMigrationsFolder = fileURLToPath(
  new URL("../../drizzle/sqlite", import.meta.url),
);

interface Ops {
  insertUser(row: UserRow): Promise<void>;
  insertProduct(row: ProductRow): Promise<void>;
  insertSale(row: SaleRow): Promise<void>;
  insertSaleItem(row: SaleItemRow): Promise<void>;
  selectProduct(id: string): Promise<ProductRow | undefined>;
}

interface Harness {
  readonly name: string;
  migrate(): Promise<void>;
  ops(): Ops;
  transaction<T>(fn: (ops: Ops) => Promise<T>): Promise<T>;
  close(): Promise<void> | void;
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  const now = Date.now();
  return {
    id: randomUUID(),
    email: `user-${randomUUID()}@example.com`,
    name: "Test User",
    passwordHash: null,
    role: "CASHIER",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
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

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${errorText(error.cause)}`;
  }
  return "";
}

async function expectRejected(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).not.toBeNull();
  expect(errorText(error)).toMatch(pattern);
}

function runDatabaseSuite(harness: Harness): void {
  describe(`${harness.name}: behavior`, () => {
    beforeAll(() => harness.migrate());
    afterAll(() => harness.close());

    it("round-trips a product with identical values", async () => {
      const product = makeProduct();
      await harness.ops().insertProduct(product);

      const found = await harness.ops().selectProduct(product.id);
      expect(found).toEqual(product);
      const typed: ProductRow | undefined = found;
      expect(typed).toBeDefined();
    });

    it("rejects a negative price (CHECK)", async () => {
      const product = makeProduct({ priceCents: -1 });
      await expectRejected(harness.ops().insertProduct(product), /check/i);
    });

    it("rejects a duplicate sku (UNIQUE)", async () => {
      const sku = `SKU-${randomUUID()}`;
      await harness.ops().insertProduct(makeProduct({ sku }));
      await expectRejected(
        harness.ops().insertProduct(makeProduct({ sku })),
        /unique/i,
      );
    });

    it("rejects an unknown category (FOREIGN KEY)", async () => {
      const product = makeProduct({ categoryId: randomUUID() });
      await expectRejected(harness.ops().insertProduct(product), /foreign key/i);
    });

    it("rejects a null name (NOT NULL)", async () => {
      const product = makeProduct({ name: null as unknown as string });
      await expectRejected(harness.ops().insertProduct(product), /not[\s-]?null/i);
    });

    it("rejects an invalid user role (CHECK)", async () => {
      const user = makeUser({ role: "SUPERUSER" });
      await expectRejected(harness.ops().insertUser(user), /check/i);
    });

    it("commits transactional work", async () => {
      const product = makeProduct();
      await harness.transaction(async (ops) => {
        await ops.insertProduct(product);
      });

      expect(await harness.ops().selectProduct(product.id)).toEqual(product);
    });

    it("rolls back transactional work on failure", async () => {
      const product = makeProduct();
      await expect(
        harness.transaction(async (ops) => {
          await ops.insertProduct(product);
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");

      expect(await harness.ops().selectProduct(product.id)).toBeUndefined();
    });

    it("enforces sale_items subtotal check", async () => {
      const user = makeUser();
      const product = makeProduct({ priceCents: 500, stockQuantity: 0 });
      await harness.ops().insertUser(user);
      await harness.ops().insertProduct(product);

      const now = Date.now();
      const sale: SaleRow = {
        id: randomUUID(),
        customerId: null,
        userId: user.id,
        totalCents: 999,
        status: "COMPLETED",
        createdAt: now,
        updatedAt: now,
      };
      await harness.ops().insertSale(sale);

      const item: SaleItemRow = {
        id: randomUUID(),
        saleId: sale.id,
        productId: product.id,
        quantity: 2,
        unitPriceCents: 500,
        subtotalCents: 999, // wrong: 2 * 500 = 1000
      };
      await expectRejected(harness.ops().insertSaleItem(item), /check/i);
    });

    it("rejects a sale for an unknown user (FOREIGN KEY)", async () => {
      const now = Date.now();
      const sale: SaleRow = {
        id: randomUUID(),
        customerId: null,
        userId: randomUUID(),
        totalCents: 0,
        status: "COMPLETED",
        createdAt: now,
        updatedAt: now,
      };
      await expectRejected(harness.ops().insertSale(sale), /foreign key/i);
    });
  });
}

function createSqliteHarness(): Harness {
  let db: SqliteDatabase;

  const opsFrom = (ctx: SqliteContext): Ops => ({
    insertUser: (row) =>
      ctx.guard(async () => {
        await ctx.db.insert(sqliteSchema.users).values(row);
      }),
    insertProduct: (row) =>
      ctx.guard(async () => {
        await ctx.db.insert(sqliteSchema.products).values(row);
      }),
    insertSale: (row) =>
      ctx.guard(async () => {
        await ctx.db.insert(sqliteSchema.sales).values(row);
      }),
    insertSaleItem: (row) =>
      ctx.guard(async () => {
        await ctx.db.insert(sqliteSchema.saleItems).values(row);
      }),
    selectProduct: async (id) => {
      const rows: ProductRow[] = await ctx.guard(async () =>
        ctx.db
          .select()
          .from(sqliteSchema.products)
          .where(eq(sqliteSchema.products.id, id)),
      );
      return rows[0];
    },
  });

  return {
    name: "sqlite",
    migrate() {
      db = new SqliteDatabase(":memory:");
      migrate(db.db, { migrationsFolder: sqliteMigrationsFolder });
      return Promise.resolve();
    },
    ops(): Ops {
      return opsFrom(db.context);
    },
    transaction<T>(fn: (ops: Ops) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(opsFrom(tx)));
    },
    close() {
      db.close();
    },
  };
}

function createPostgresHarness(url: string): Harness {
  let db: PostgresDatabase;

  const opsFrom = (ctx: PgContext): Ops => ({
    insertUser: async (row) => {
      await ctx.db.insert(pgSchema.users).values(row);
    },
    insertProduct: async (row) => {
      await ctx.db.insert(pgSchema.products).values(row);
    },
    insertSale: async (row) => {
      await ctx.db.insert(pgSchema.sales).values(row);
    },
    insertSaleItem: async (row) => {
      await ctx.db.insert(pgSchema.saleItems).values(row);
    },
    selectProduct: async (id) => {
      const rows: ProductRow[] = await ctx.db
        .select()
        .from(pgSchema.products)
        .where(eq(pgSchema.products.id, id));
      return rows[0];
    },
  });

  return {
    name: "postgres",
    async migrate() {
      await runMigrations(url);
      db = new PostgresDatabase(url);
    },
    ops(): Ops {
      return opsFrom(db.context);
    },
    transaction<T>(fn: (ops: Ops) => Promise<T>): Promise<T> {
      return db.transaction((tx) => fn(opsFrom(tx)));
    },
    close: () => db.close(),
  };
}

runDatabaseSuite(createSqliteHarness());

describe("sqlite: file database migrations", () => {
  it("applies migrations to a file-based database and is idempotent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pos-sqlite-"));
    const url = `file:${join(dir, "test.db")}`;

    await runMigrations(url);
    await runMigrations(url); // second run must be a no-op

    const db = new SqliteDatabase(join(dir, "test.db"));
    try {
      const names = await db.context.guard(() =>
        Promise.resolve(
          db.context.db.all<{ name: string }>(
            `select name from sqlite_master where type = 'table' order by name`,
          ),
        ),
      );
      const tableNames = names.map((t) => t.name);
      expect(tableNames).toContain("products");
      expect(tableNames).toContain("sales");
      expect(tableNames).toContain("inventory_movements");
      expect(tableNames).toContain("__drizzle_migrations");
    } finally {
      db.close();
    }
  });

  it("serializes access so steady queries cannot interleave in a transaction", async () => {
    const db = new SqliteDatabase(":memory:");
    migrate(db.db, { migrationsFolder: sqliteMigrationsFolder });
    try {
      const order: string[] = [];
      const txDone = db.transaction(async (tx) => {
        order.push("tx:start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        await tx.guard(async () => {
          await tx.db.insert(sqliteSchema.products).values(makeProduct());
        });
        order.push("tx:end");
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      await db.context.guard(async () => {
        await db.context.db.select().from(sqliteSchema.products);
      });
      order.push("steady:done");

      await txDone;
      expect(order).toEqual(["tx:start", "tx:end", "steady:done"]);
    } finally {
      db.close();
    }
  });
});

describe("postgres", () => {
  const url = loadEnv().TEST_POSTGRES_URL;

  if (!url) {
    it.skip("TEST_POSTGRES_URL not configured", () => {});
  } else {
    runDatabaseSuite(createPostgresHarness(url));
  }
});
