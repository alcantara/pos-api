import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  CategoryRepository,
  ListCategoriesParams,
  PagedCategories,
} from "../ports/category-repository.js";
import type { Category } from "../../domain/entities/category.js";
import { CategoryNotFoundError } from "../../domain/entities/category.js";
import { ConflictError } from "../../domain/errors/domain-error.js";
import { createCategory } from "./create-category.js";
import { deleteCategory } from "./delete-category.js";
import { getCategory } from "./get-category.js";
import { listCategories } from "./list-categories.js";
import { updateCategory } from "./update-category.js";

class InMemoryCategoryRepository implements CategoryRepository {
  private readonly rows = new Map<string, Category>();

  findById(id: string): Promise<Category | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByName(name: string): Promise<Category | null> {
    for (const row of this.rows.values()) {
      if (row.name === name) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  insert(category: Category): Promise<void> {
    this.rows.set(category.id, category);
    return Promise.resolve();
  }

  update(category: Category): Promise<void> {
    this.rows.set(category.id, category);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  list(params: ListCategoriesParams): Promise<PagedCategories> {
    let rows = [...this.rows.values()];
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter((row) => row.name.toLowerCase().includes(needle));
    }
    rows.sort((a, b) =>
      params.sort === "name" ? a.name.localeCompare(b.name) : a.createdAt - b.createdAt,
    );
    if (params.order === "desc") rows.reverse();
    const total = rows.length;
    const offset = (params.page - 1) * params.limit;
    return Promise.resolve({
      rows: rows.slice(offset, offset + params.limit),
      total,
    });
  }
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

describe("createCategory", () => {
  it("generates id and timestamps", async () => {
    const repository = new InMemoryCategoryRepository();
    const category = await createCategory(repository, { name: "Keyboards" });

    expect(category.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(category.name).toBe("Keyboards");
    expect(category.createdAt).toBe(category.updatedAt);
    expect(await repository.findById(category.id)).toEqual(category);
  });

  it("rejects a duplicate name with ConflictError", async () => {
    const repository = new InMemoryCategoryRepository();
    await repository.insert(makeCategory({ name: "Mice" }));

    await expect(createCategory(repository, { name: "Mice" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("getCategory", () => {
  it("returns the category when found", async () => {
    const repository = new InMemoryCategoryRepository();
    const category = makeCategory();
    await repository.insert(category);

    expect(await getCategory(repository, category.id)).toEqual(category);
  });

  it("throws CATEGORY_NOT_FOUND when missing", async () => {
    const repository = new InMemoryCategoryRepository();
    const error = await getCategory(repository, randomUUID()).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(CategoryNotFoundError);
    expect((error as CategoryNotFoundError).code).toBe("CATEGORY_NOT_FOUND");
  });
});

describe("listCategories", () => {
  it("paginates and computes totalPages", async () => {
    const repository = new InMemoryCategoryRepository();
    for (let i = 0; i < 5; i += 1) {
      await repository.insert(makeCategory({ name: `Cat ${i}` }));
    }

    const page = await listCategories(repository, {
      page: 2,
      limit: 2,
      sort: "name",
      order: "asc",
    });

    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.categories).toHaveLength(2);
    expect(page.categories[0]?.name).toBe("Cat 2");
  });

  it("filters by search", async () => {
    const repository = new InMemoryCategoryRepository();
    await repository.insert(makeCategory({ name: "Drinks" }));
    await repository.insert(makeCategory({ name: "Snacks" }));

    const page = await listCategories(repository, {
      page: 1,
      limit: 10,
      search: "dr",
      sort: "name",
      order: "asc",
    });

    expect(page.total).toBe(1);
    expect(page.categories[0]?.name).toBe("Drinks");
  });
});

describe("updateCategory", () => {
  it("renames and bumps updatedAt", async () => {
    const repository = new InMemoryCategoryRepository();
    const category = makeCategory({ name: "Old name" });
    await repository.insert(category);

    const updated = await updateCategory(repository, {
      id: category.id,
      changes: { name: "New name" },
    });

    expect(updated.name).toBe("New name");
    expect(updated.createdAt).toBe(category.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(category.updatedAt);
  });

  it("rejects renaming to an existing name", async () => {
    const repository = new InMemoryCategoryRepository();
    await repository.insert(makeCategory({ name: "Taken" }));
    const category = makeCategory();
    await repository.insert(category);

    await expect(
      updateCategory(repository, { id: category.id, changes: { name: "Taken" } }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws CATEGORY_NOT_FOUND for a missing category", async () => {
    const repository = new InMemoryCategoryRepository();
    await expect(
      updateCategory(repository, { id: randomUUID(), changes: { name: "x" } }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

describe("deleteCategory", () => {
  it("removes the category", async () => {
    const repository = new InMemoryCategoryRepository();
    const category = makeCategory();
    await repository.insert(category);

    await deleteCategory(repository, category.id);

    expect(await repository.findById(category.id)).toBeNull();
  });

  it("throws CATEGORY_NOT_FOUND for a missing category", async () => {
    const repository = new InMemoryCategoryRepository();
    await expect(deleteCategory(repository, randomUUID())).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );
  });
});
