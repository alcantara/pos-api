import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CategoryLookup } from "../ports/category-repository.js";
import type {
  ListProductsParams,
  PagedProducts,
  ProductRepository,
} from "../ports/product-repository.js";
import type { Product } from "../../domain/entities/product.js";
import { ProductNotFoundError } from "../../domain/entities/product.js";
import { ConflictError, ValidationError } from "../../domain/errors/domain-error.js";
import { createProduct } from "./create-product.js";
import { deleteProduct } from "./delete-product.js";
import { getProduct } from "./get-product.js";
import { listProducts } from "./list-products.js";
import { updateProduct } from "./update-product.js";

const KNOWN_CATEGORY_ID = randomUUID();

/** Category lookup fake: exactly one category exists. */
const categories: CategoryLookup = {
  findById: (id) =>
    Promise.resolve(
      id === KNOWN_CATEGORY_ID
        ? {
            id,
            name: "Keyboards",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        : null,
    ),
};

class InMemoryProductRepository implements ProductRepository {
  private readonly rows = new Map<string, Product>();

  findById(id: string): Promise<Product | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findBySku(sku: string): Promise<Product | null> {
    for (const row of this.rows.values()) {
      if (row.sku === sku) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  insert(product: Product): Promise<void> {
    this.rows.set(product.id, product);
    return Promise.resolve();
  }

  update(product: Product): Promise<void> {
    this.rows.set(product.id, product);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  list(params: ListProductsParams): Promise<PagedProducts> {
    let rows = [...this.rows.values()];
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          row.sku.toLowerCase().includes(needle),
      );
    }
    rows.sort((a, b) => {
      if (params.sort === "name") return a.name.localeCompare(b.name);
      if (params.sort === "price") return a.priceCents - b.priceCents;
      return a.createdAt - b.createdAt;
    });
    if (params.order === "desc") rows.reverse();
    const total = rows.length;
    const offset = (params.page - 1) * params.limit;
    return Promise.resolve({
      rows: rows.slice(offset, offset + params.limit),
      total,
    });
  }
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

describe("createProduct", () => {
  it("generates id/timestamps and applies defaults", async () => {
    const repository = new InMemoryProductRepository();
    const product = await createProduct(repository, categories, {
      sku: "KB-001",
      name: "Keyboard",
      priceCents: 19990,
    });

    expect(product.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(product.stockQuantity).toBe(0);
    expect(product.description).toBeNull();
    expect(product.categoryId).toBeNull();
    expect(product.createdAt).toBe(product.updatedAt);
    expect(await repository.findById(product.id)).toEqual(product);
  });

  it("rejects a duplicate SKU with ConflictError", async () => {
    const repository = new InMemoryProductRepository();
    await repository.insert(makeProduct({ sku: "DUP" }));

    await expect(
      createProduct(repository, categories, {
        sku: "DUP",
        name: "Other",
        priceCents: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("stores an existing categoryId", async () => {
    const repository = new InMemoryProductRepository();
    const product = await createProduct(repository, categories, {
      sku: "CAT-001",
      name: "With category",
      priceCents: 100,
      categoryId: KNOWN_CATEGORY_ID,
    });

    expect(product.categoryId).toBe(KNOWN_CATEGORY_ID);
    expect(await repository.findById(product.id)).toEqual(product);
  });

  it("rejects an unknown categoryId with ValidationError", async () => {
    const repository = new InMemoryProductRepository();
    const error = await createProduct(repository, categories, {
      sku: "CAT-002",
      name: "Bad category",
      priceCents: 100,
      categoryId: randomUUID(),
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("VALIDATION_ERROR");
  });
});

describe("getProduct", () => {
  it("returns the product when found", async () => {
    const repository = new InMemoryProductRepository();
    const product = makeProduct();
    await repository.insert(product);

    expect(await getProduct(repository, product.id)).toEqual(product);
  });

  it("throws PRODUCT_NOT_FOUND when missing", async () => {
    const repository = new InMemoryProductRepository();
    const error = await getProduct(repository, randomUUID()).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ProductNotFoundError);
    expect((error as ProductNotFoundError).code).toBe("PRODUCT_NOT_FOUND");
  });
});

describe("listProducts", () => {
  async function seed(count: number): Promise<InMemoryProductRepository> {
    const repository = new InMemoryProductRepository();
    for (let i = 0; i < count; i += 1) {
      await repository.insert(
        makeProduct({
          name: `Item ${String(i).padStart(2, "0")}`,
          priceCents: (i + 1) * 100,
        }),
      );
    }
    return repository;
  }

  it("computes totalPages", async () => {
    const repository = await seed(5);
    const page = await listProducts(repository, {
      page: 2,
      limit: 2,
      sort: "name",
      order: "asc",
    });

    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.page).toBe(2);
    expect(page.products).toHaveLength(2);
    expect(page.products[0]?.name).toBe("Item 02");
  });

  it("returns an empty page with totalPages 0 when nothing matches", async () => {
    const repository = await seed(5);
    const page = await listProducts(repository, {
      page: 1,
      limit: 10,
      search: "does-not-exist",
      sort: "name",
      order: "asc",
    });

    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(0);
    expect(page.products).toEqual([]);
  });
});

describe("updateProduct", () => {
  it("applies partial changes and bumps updatedAt", async () => {
    const repository = new InMemoryProductRepository();
    const product = makeProduct();
    await repository.insert(product);

    const updated = await updateProduct(repository, categories, {
      id: product.id,
      changes: { name: "Mechanical Keyboard" },
    });

    expect(updated.name).toBe("Mechanical Keyboard");
    expect(updated.priceCents).toBe(product.priceCents);
    expect(updated.sku).toBe(product.sku);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(product.updatedAt);
  });

  it("clears description when set to null", async () => {
    const repository = new InMemoryProductRepository();
    const product = makeProduct({ description: "old text" });
    await repository.insert(product);

    const updated = await updateProduct(repository, categories, {
      id: product.id,
      changes: { description: null },
    });

    expect(updated.description).toBeNull();
  });

  it("throws PRODUCT_NOT_FOUND for a missing product", async () => {
    const repository = new InMemoryProductRepository();
    await expect(
      updateProduct(repository, categories, {
        id: randomUUID(),
        changes: { name: "x" },
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it("rejects changing the SKU to one that already exists", async () => {
    const repository = new InMemoryProductRepository();
    await repository.insert(makeProduct({ sku: "TAKEN" }));
    const product = makeProduct();
    await repository.insert(product);

    await expect(
      updateProduct(repository, categories, {
        id: product.id,
        changes: { sku: "TAKEN" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("assigns and clears categoryId", async () => {
    const repository = new InMemoryProductRepository();
    const product = makeProduct();
    await repository.insert(product);

    const assigned = await updateProduct(repository, categories, {
      id: product.id,
      changes: { categoryId: KNOWN_CATEGORY_ID },
    });
    expect(assigned.categoryId).toBe(KNOWN_CATEGORY_ID);

    const cleared = await updateProduct(repository, categories, {
      id: product.id,
      changes: { categoryId: null },
    });
    expect(cleared.categoryId).toBeNull();
  });

  it("rejects updating to an unknown categoryId", async () => {
    const repository = new InMemoryProductRepository();
    const product = makeProduct();
    await repository.insert(product);

    await expect(
      updateProduct(repository, categories, {
        id: product.id,
        changes: { categoryId: randomUUID() },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("deleteProduct", () => {
  it("removes the product", async () => {
    const repository = new InMemoryProductRepository();
    const product = makeProduct();
    await repository.insert(product);

    await deleteProduct(repository, product.id);

    expect(await repository.findById(product.id)).toBeNull();
  });

  it("throws PRODUCT_NOT_FOUND for a missing product", async () => {
    const repository = new InMemoryProductRepository();
    await expect(deleteProduct(repository, randomUUID())).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });
});
