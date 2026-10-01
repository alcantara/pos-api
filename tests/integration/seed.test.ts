import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Dependencies } from "../../src/application/dependencies.js";
import { loadEnv } from "../../src/config/env.js";
import {
  SEED_CATEGORIES,
  SEED_CUSTOMERS,
  SEED_PRODUCTS,
  SEED_USERS,
  seedAll,
  seedCatalog,
  seedUsers,
} from "../../src/infrastructure/database/seed.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

describe.each(targets())("seed on $name", ({ databaseUrl }) => {
  let dependencies: Dependencies;
  let close: () => Promise<void>;

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
  });

  afterAll(async () => {
    await close();
  });

  it("leaves exactly one user per seeded email", async () => {
    const result = await seedUsers(dependencies);

    expect(result.created.length + result.existing.length).toBe(SEED_USERS.length);
    for (const seed of SEED_USERS) {
      const user = await dependencies.users.findByEmail(seed.email);
      expect(user).not.toBeNull();
      expect(user?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
    }
  });

  it("is idempotent: a second run creates nothing and keeps the same ids", async () => {
    const before = await Promise.all(
      SEED_USERS.map(async (seed) => dependencies.users.findByEmail(seed.email)),
    );

    const result = await seedUsers(dependencies);

    expect(result.created).toHaveLength(0);
    expect(result.existing).toHaveLength(SEED_USERS.length);

    const after = await Promise.all(
      SEED_USERS.map(async (seed) => dependencies.users.findByEmail(seed.email)),
    );
    for (const [index, user] of after.entries()) {
      expect(user?.id).toBe(before[index]?.id);
      expect(user?.role).toBe(before[index]?.role);
    }
  });

  it("gives every seeded user its name, role and no password hash", async () => {
    for (const seed of SEED_USERS) {
      const user = await dependencies.users.findByEmail(seed.email);

      expect(user?.name).toBe(seed.name);
      expect(user?.passwordHash).toBeNull();
    }
  });

  it("never overwrites a role changed after seeding", async () => {
    const seeded = await dependencies.users.findByEmail("manager@pos.local");
    if (!seeded) throw new Error("seeded manager user is missing");

    try {
      await dependencies.users.update({ ...seeded, role: "ADMIN" });
      await seedUsers(dependencies);

      const after = await dependencies.users.findByEmail("manager@pos.local");
      expect(after?.role).toBe("ADMIN");
    } finally {
      await dependencies.users.update(seeded);
    }
  });
});

describe.each(targets())("catalog seed on $name", ({ databaseUrl }) => {
  let dependencies: Dependencies;
  let close: () => Promise<void>;

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
  });

  afterAll(async () => {
    await close();
  });

  it("creates the documented categories, products and customers", async () => {
    await seedCatalog(dependencies);

    for (const category of SEED_CATEGORIES) {
      const page = await dependencies.categories.list({
        page: 1,
        limit: 100,
        sort: "name",
        order: "asc",
      });
      expect(page.rows.some((row) => row.name === category.name)).toBe(true);
    }

    for (const product of SEED_PRODUCTS) {
      const stored = await dependencies.products.findBySku(product.sku);
      expect(stored?.name).toBe(product.name);
      expect(stored?.priceCents).toBe(product.priceCents);
      expect(stored?.stockQuantity).toBe(product.stockQuantity);
      expect(stored?.categoryId).not.toBeNull();
    }

    for (const customer of SEED_CUSTOMERS) {
      const stored = await dependencies.customers.findByEmail(customer.email);
      expect(stored?.name).toBe(customer.name);
    }
  });

  it("is idempotent: a second run creates nothing", async () => {
    const before = await Promise.all(
      SEED_PRODUCTS.map(async (product) =>
        dependencies.products.findBySku(product.sku),
      ),
    );

    const result = await seedCatalog(dependencies);

    expect(result.created).toHaveLength(0);
    expect(result.existing.length).toBe(
      SEED_CATEGORIES.length + SEED_PRODUCTS.length + SEED_CUSTOMERS.length,
    );

    const after = await Promise.all(
      SEED_PRODUCTS.map(async (product) =>
        dependencies.products.findBySku(product.sku),
      ),
    );
    for (const [index, product] of after.entries()) {
      expect(product?.id).toBe(before[index]?.id);
    }
  });

  it("never overwrites a seeded product that was later repriced", async () => {
    const seed = SEED_PRODUCTS[0];
    if (!seed) throw new Error("no seeded product");
    const stored = await dependencies.products.findBySku(seed.sku);
    if (!stored) throw new Error("seeded product missing");

    try {
      await dependencies.products.update({ ...stored, priceCents: 1 });
      await seedCatalog(dependencies);

      const after = await dependencies.products.findBySku(seed.sku);
      expect(after?.priceCents).toBe(1);
    } finally {
      await dependencies.products.update(stored);
    }
  });

  it("seedAll covers users and catalog in one pass", async () => {
    const result = await seedAll(dependencies);

    expect(result.created.length + result.existing.length).toBeGreaterThanOrEqual(
      SEED_USERS.length +
        SEED_CATEGORIES.length +
        SEED_PRODUCTS.length +
        SEED_CUSTOMERS.length,
    );
  });
});
