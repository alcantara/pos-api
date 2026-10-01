import { asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type {
  CategoryRepository,
  ListCategoriesParams,
  PagedCategories,
} from "../../application/ports/category-repository.js";
import type { Category } from "../../domain/entities/category.js";
import type { PgContext } from "../database/postgres.js";
import { categories } from "../database/schema/postgres.js";
import { toConflictError } from "./db-errors.js";
import { containsPattern } from "./like.js";

export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly ctx: PgContext) {}

  async findById(id: string): Promise<Category | null> {
    const rows = await this.ctx.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<Category | null> {
    const rows = await this.ctx.db
      .select()
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(category: Category): Promise<void> {
    try {
      await this.ctx.db.insert(categories).values(category);
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
      await this.ctx.db
        .update(categories)
        .set({ name: category.name, updatedAt: category.updatedAt })
        .where(eq(categories.id, category.id));
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A category named "${category.name}" already exists`,
        }) ?? error
      );
    }
  }

  async delete(id: string): Promise<void> {
    await this.ctx.db.delete(categories).where(eq(categories.id, id));
  }

  async list(params: ListCategoriesParams): Promise<PagedCategories> {
    const where = buildSearchFilter(params.search);
    const order = buildOrder(params);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await Promise.all([
      this.ctx.db
        .select()
        .from(categories)
        .where(where)
        .orderBy(...order)
        .limit(params.limit)
        .offset(offset),
      this.ctx.db.select({ total: count() }).from(categories).where(where),
    ]);

    return { rows, total: counts[0]?.total ?? 0 };
  }
}

function buildSearchFilter(search: string | undefined): SQL | undefined {
  if (!search) return undefined;
  const pattern = containsPattern(search);
  return sql`${categories.name} ilike ${pattern} escape '\\'`;
}

function buildOrder(params: ListCategoriesParams): [SQL, SQL] {
  const column = params.sort === "name" ? categories.name : categories.createdAt;
  const primary = params.order === "asc" ? asc(column) : desc(column);
  return [primary, asc(categories.id)];
}
