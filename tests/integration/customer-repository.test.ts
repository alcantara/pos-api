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
import type { Customer } from "../../src/domain/entities/customer.js";
import type { CustomerRepository } from "../../src/application/ports/customer-repository.js";
import { ConflictError } from "../../src/domain/errors/domain-error.js";

type AnyDatabase = SqliteDatabase | PostgresDatabase;

/**
 * Customer repository behavior must hold on every supported engine, so this
 * suite runs against SQLite always and against PostgreSQL when
 * TEST_POSTGRES_URL is configured (always in CI — see tests/setup.ts).
 */
function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const now = Date.now();
  return {
    id: randomUUID(),
    name: "Ana Silva",
    email: `${randomUUID()}@example.com`,
    phone: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

interface SaleFixture {
  userId: string;
  saleId: string;
}

/** A sale requires an existing user (both foreign keys are RESTRICT). */
async function insertSale(
  database: AnyDatabase,
  customerId: string,
): Promise<SaleFixture> {
  const userId = randomUUID();
  const saleId = randomUUID();
  const now = Date.now();
  const user = {
    id: userId,
    email: `${userId}@example.com`,
    name: "Test user",
    passwordHash: null,
    role: "ADMIN",
    createdAt: now,
    updatedAt: now,
  };
  const sale = {
    id: saleId,
    customerId,
    userId,
    totalCents: 100,
    status: "COMPLETED",
    createdAt: now,
    updatedAt: now,
  };

  if (database instanceof SqliteDatabase) {
    await database.context.guard(async () => {
      await database.context.db.insert(sqliteSchema.users).values(user);
      await database.context.db.insert(sqliteSchema.sales).values(sale);
    });
    return { userId, saleId };
  }

  await database.context.db.insert(pgSchema.users).values(user);
  await database.context.db.insert(pgSchema.sales).values(sale);
  return { userId, saleId };
}

async function deleteSale(
  database: AnyDatabase,
  fixture: SaleFixture,
): Promise<void> {
  if (database instanceof SqliteDatabase) {
    await database.context.guard(async () => {
      await database.context.db
        .delete(sqliteSchema.sales)
        .where(eq(sqliteSchema.sales.id, fixture.saleId));
      await database.context.db
        .delete(sqliteSchema.users)
        .where(eq(sqliteSchema.users.id, fixture.userId));
    });
    return;
  }

  await database.context.db
    .delete(pgSchema.sales)
    .where(eq(pgSchema.sales.id, fixture.saleId));
  await database.context.db
    .delete(pgSchema.users)
    .where(eq(pgSchema.users.id, fixture.userId));
}

describe.each(targets())("customer repository ($name)", (target) => {
  let created: CreatedDependencies;
  let customers: CustomerRepository;
  const insertedCustomerIds: string[] = [];
  const saleFixtures: SaleFixture[] = [];

  beforeAll(async () => {
    created = await createDependencies({
      ...loadEnv(),
      DATABASE_URL: target.databaseUrl,
    });
    customers = created.dependencies.customers;
  });

  afterAll(async () => {
    for (const fixture of saleFixtures) {
      await deleteSale(created.database, fixture).catch(() => undefined);
    }
    for (const id of insertedCustomerIds) {
      await customers.delete(id).catch(() => undefined);
    }
    await created.close();
  });

  function track(customer: Customer): Customer {
    insertedCustomerIds.push(customer.id);
    return customer;
  }

  it("inserts and reads back by id and email", async () => {
    const customer = track(makeCustomer({ phone: "+5511999990000" }));
    await customers.insert(customer);

    expect(await customers.findById(customer.id)).toEqual(customer);
    expect(await customers.findByEmail(customer.email ?? "")).toEqual(customer);
  });

  it("returns null for unknown id and email", async () => {
    expect(await customers.findById(randomUUID())).toBeNull();
    expect(await customers.findByEmail(`missing-${randomUUID()}`)).toBeNull();
  });

  it("allows multiple customers without email", async () => {
    const first = track(makeCustomer({ email: null, name: "Walk-in 1" }));
    const second = track(makeCustomer({ email: null, name: "Walk-in 2" }));
    await customers.insert(first);
    await customers.insert(second);

    expect(await customers.findById(first.id)).not.toBeNull();
    expect(await customers.findById(second.id)).not.toBeNull();
  });

  it("rejects a duplicate email with ConflictError", async () => {
    const email = `${randomUUID()}@example.com`;
    await customers.insert(track(makeCustomer({ email })));

    await expect(
      customers.insert(makeCustomer({ email })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("paginates, sorts and computes total", async () => {
    const token = `C${randomUUID().slice(0, 8)}`;
    for (const name of ["gamma", "alpha", "beta"]) {
      await customers.insert(track(makeCustomer({ name: `${token} ${name}` })));
    }

    const page = await customers.list({
      page: 1,
      limit: 2,
      search: token,
      sort: "name",
      order: "asc",
    });

    expect(page.total).toBe(3);
    expect(page.rows.map((row) => row.name)).toEqual([
      `${token} alpha`,
      `${token} beta`,
    ]);

    const secondPage = await customers.list({
      page: 2,
      limit: 2,
      search: token,
      sort: "name",
      order: "asc",
    });
    expect(secondPage.rows.map((row) => row.name)).toEqual([`${token} gamma`]);
  });

  it("searches name, email and phone; escapes LIKE wildcards", async () => {
    const token = `S${randomUUID().slice(0, 8)}`;
    await customers.insert(
      track(
        makeCustomer({
          name: `${token} 50% Off`,
          email: `${token}@example.com`,
          phone: "+5511888880000",
        }),
      ),
    );
    await customers.insert(track(makeCustomer({ name: `${token} plain` })));

    const byEmail = await customers.list({
      page: 1,
      limit: 10,
      search: token.toUpperCase(),
      sort: "name",
      order: "asc",
    });
    expect(byEmail.total).toBe(2);

    const byPhone = await customers.list({
      page: 1,
      limit: 10,
      search: "88888",
      sort: "name",
      order: "asc",
    });
    expect(byPhone.total).toBe(1);

    const wildcard = await customers.list({
      page: 1,
      limit: 10,
      search: "50%",
      sort: "name",
      order: "asc",
    });
    // A non-escaped pattern would match every row in the table.
    expect(wildcard.total).toBe(1);
    expect(wildcard.rows[0]?.name).toBe(`${token} 50% Off`);
  });

  it("updates a customer", async () => {
    const customer = track(makeCustomer());
    await customers.insert(customer);

    const updated: Customer = {
      ...customer,
      name: "Updated name",
      phone: "+5511777770000",
      updatedAt: Date.now() + 1,
    };
    await customers.update(updated);

    expect(await customers.findById(customer.id)).toEqual(updated);
  });

  it("deletes a customer", async () => {
    const customer = track(makeCustomer());
    await customers.insert(customer);

    await customers.delete(customer.id);

    expect(await customers.findById(customer.id)).toBeNull();
  });

  it("rejects deleting a customer that has sales", async () => {
    const customer = track(makeCustomer());
    await customers.insert(customer);
    saleFixtures.push(await insertSale(created.database, customer.id));

    await expect(customers.delete(customer.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await customers.findById(customer.id)).not.toBeNull();
  });
});
