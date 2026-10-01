import { asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type {
  CategoryRepository,
  ListCategoriesParams,
  PagedCategories,
} from "../../application/ports/category-repository.js";
import type { Category } from "../../domain/entities/category.js";
import type { SqliteContext } from "../database/sqlite.js";
import { categories } from "../database/schema/sqlite.js";
import { toConflictError } from "./db-errors.js";
import { containsPattern } from "./like.js";

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(private readonly ctx: SqliteContext) {}

  async findById(id: string): Promise<Category | null> {
    const rows = await this.ctx.guard(async () =>
      this.ctx.db.select().from(categories).where(eq(categories.id, id)).limit(1),
    );
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<Category | null> {
    const rows = await this.ctx.guard(async () =>
      this.ctx.db.select().from(categories).where(eq(categories.name, name)).limit(1),
    );
    return rows[0] ?? null;
  }

  async insert(category: Category): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db.insert(categories).values(category);
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A category named "${category.name}" already exists`,
        }) ?? error
      );
    }
  }

  async update(category: Category): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db
          .update(categories)
          .set({ name: category.name, updatedAt: category.updatedAt })
          .where(eq(categories.id, category.id));
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A category named "${category.name}" already exists`,
        }) ?? error
      );
    }
  }

  /** Products keep existing: `products.category_id` is `ON DELETE SET NULL`. */
  async delete(id: string): Promise<void> {
    await this.ctx.guard(async () => {
      await this.ctx.db.delete(categories).where(eq(categories.id, id));
    });
  }

  async list(params: ListCategoriesParams): Promise<PagedCategories> {
    const where = buildSearchFilter(params.search);
    const order = buildOrder(params);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await this.ctx.guard(async () => {
      const rowsQuery = this.ctx.db
        .select()
        .from(categories)
        .where(where)
        .orderBy(...order)
        .limit(params.limit)
        .offset(offset);
      const countQuery = this.ctx.db
        .select({ total: count() })
        .from(categories)
        .where(where);
      return Promise.all([rowsQuery, countQuery]);
    });

    return { rows, total: counts[0]?.total ?? 0 };
  }
}

/** SQLite `LIKE` is case-insensitive for ASCII; wildcards are escaped. */
function buildSearchFilter(search: string | undefined): SQL | undefined {
  if (!search) return undefined;
  const pattern = containsPattern(search);
  return sql`${categories.name} like ${pattern} escape '\\'`;
}

function buildOrder(params: ListCategoriesParams): [SQL, SQL] {
  const column = params.sort === "name" ? categories.name : categories.createdAt;
  const primary = params.order === "asc" ? asc(column) : desc(column);
  return [primary, asc(categories.id)];
}
