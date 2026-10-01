import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreatedDependencies } from "../../src/infrastructure/dependencies.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";
import { loadEnv } from "../../src/config/env.js";
import type { Category } from "../../src/domain/entities/category.js";
import type { CategoryRepository } from "../../src/application/ports/category-repository.js";
import type { ProductRepository } from "../../src/application/ports/product-repository.js";
import { ConflictError } from "../../src/domain/errors/domain-error.js";

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  const now = Date.now();
  return {
    id: randomUUID(),
    name: `Category ${randomUUID().slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe.each(targets())("category repository ($name)", (target) => {
  let created: CreatedDependencies;
  let categories: CategoryRepository;
  let products: ProductRepository;
  const insertedCategoryIds: string[] = [];
  const insertedProductIds: string[] = [];

  beforeAll(async () => {
    created = await createDependencies({
      ...loadEnv(),
      DATABASE_URL: target.databaseUrl,
    });
    categories = created.dependencies.categories;
    products = created.dependencies.products;
  });

  afterAll(async () => {
    for (const id of insertedProductIds) {
      await products.delete(id).catch(() => undefined);
    }
    for (const id of insertedCategoryIds) {
      await categories.delete(id).catch(() => undefined);
    }
    await created.close();
  });

  function track(category: Category): Category {
    insertedCategoryIds.push(category.id);
    return category;
  }

  it("inserts and reads back by id and name", async () => {
    const category = track(makeCategory());
    await categories.insert(category);

    expect(await categories.findById(category.id)).toEqual(category);
    expect(await categories.findByName(category.name)).toEqual(category);
  });

  it("returns null for unknown id and name", async () => {
    expect(await categories.findById(randomUUID())).toBeNull();
    expect(await categories.findByName(`missing-${randomUUID()}`)).toBeNull();
  });

  it("rejects a duplicate name with ConflictError", async () => {
    const name = `Category ${randomUUID()}`;
    await categories.insert(track(makeCategory({ name })));

    await expect(categories.insert(makeCategory({ name }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("paginates, sorts and computes total", async () => {
    const token = `C${randomUUID().slice(0, 8)}`;
    for (const name of ["gamma", "alpha", "beta"]) {
      await categories.insert(track(makeCategory({ name: `${token} ${name}` })));
    }

    const page = await categories.list({
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

    const secondPage = await categories.list({
      page: 2,
      limit: 2,
      search: token,
      sort: "name",
      order: "asc",
    });
    expect(secondPage.rows.map((row) => row.name)).toEqual([`${token} gamma`]);
  });

  it("searches case-insensitively and treats LIKE wildcards literally", async () => {
    const token = `S${randomUUID().slice(0, 8)}`;
    await categories.insert(track(makeCategory({ name: `${token} 50% off` })));
    await categories.insert(track(makeCategory({ name: `${token} plain` })));

    const upper = await categories.list({
      page: 1,
      limit: 10,
      search: token.toUpperCase(),
      sort: "name",
      order: "asc",
    });
    expect(upper.total).toBe(2);

    const wildcard = await categories.list({
      page: 1,
      limit: 10,
      search: "50%",
      sort: "name",
      order: "asc",
    });
    expect(wildcard.total).toBe(1);
    expect(wildcard.rows[0]?.name).toBe(`${token} 50% off`);
  });

  it("updates a category", async () => {
    const category = track(makeCategory());
    await categories.insert(category);

    const updated: Category = {
      ...category,
      name: `Updated ${category.name}`,
      updatedAt: Date.now() + 1,
    };
    await categories.update(updated);

    expect(await categories.findById(category.id)).toEqual(updated);
  });

  it("deleting a referenced category nulls product references and keeps products", async () => {
    const category = track(makeCategory());
    await categories.insert(category);

    const product = {
      id: randomUUID(),
      sku: `SKU-${randomUUID()}`,
      name: "Categorized product",
      description: null,
      priceCents: 100,
      stockQuantity: 0,
      categoryId: category.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    insertedProductIds.push(product.id);
    await products.insert(product);

    await categories.delete(category.id);

    expect(await categories.findById(category.id)).toBeNull();
    const survivors = await products.findById(product.id);
    expect(survivors).not.toBeNull();
    expect(survivors?.categoryId).toBeNull();
  });
});
