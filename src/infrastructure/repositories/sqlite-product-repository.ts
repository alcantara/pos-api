import { asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type {
  ListProductsParams,
  PagedProducts,
  ProductRepository,
} from "../../application/ports/product-repository.js";
import type { Product } from "../../domain/entities/product.js";
import type { SqliteContext } from "../database/sqlite.js";
import { products } from "../database/schema/sqlite.js";
import { toConflictError } from "./db-errors.js";
import { containsPattern } from "./like.js";

export class SqliteProductRepository implements ProductRepository {
  constructor(private readonly ctx: SqliteContext) {}

  async findById(id: string): Promise<Product | null> {
    const rows = await this.ctx.guard(async () =>
      this.ctx.db.select().from(products).where(eq(products.id, id)).limit(1),
    );
    return rows[0] ?? null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const rows = await this.ctx.guard(async () =>
      this.ctx.db.select().from(products).where(eq(products.sku, sku)).limit(1),
    );
    return rows[0] ?? null;
  }

  async insert(product: Product): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db.insert(products).values(product);
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A product with SKU "${product.sku}" already exists`,
          foreignKey: "The referenced category does not exist",
        }) ?? error
      );
    }
  }

  async update(product: Product): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db
          .update(products)
          .set({
            sku: product.sku,
            name: product.name,
            description: product.description,
            priceCents: product.priceCents,
            stockQuantity: product.stockQuantity,
            categoryId: product.categoryId,
            updatedAt: product.updatedAt,
          })
          .where(eq(products.id, product.id));
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          unique: `A product with SKU "${product.sku}" already exists`,
          foreignKey: "The referenced category does not exist",
        }) ?? error
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.ctx.guard(async () => {
        await this.ctx.db.delete(products).where(eq(products.id, id));
      });
    } catch (error) {
      throw (
        toConflictError(error, {
          foreignKey:
            "The product cannot be deleted while sales or inventory movements reference it",
        }) ?? error
      );
    }
  }

  async list(params: ListProductsParams): Promise<PagedProducts> {
    const where = buildSearchFilter(params.search);
    const order = buildOrder(params);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await this.ctx.guard(async () => {
      const rowsQuery = this.ctx.db
        .select()
        .from(products)
        .where(where)
        .orderBy(...order)
        .limit(params.limit)
        .offset(offset);
      const countQuery = this.ctx.db
        .select({ total: count() })
        .from(products)
        .where(where);
      return Promise.all([rowsQuery, countQuery]);
    });

    return { rows, total: counts[0]?.total ?? 0 };
  }
}

function buildSearchFilter(search: string | undefined): SQL | undefined {
  if (!search) return undefined;
  const pattern = containsPattern(search);
  return sql`(${products.name} like ${pattern} escape '\\' or ${products.sku} like ${pattern} escape '\\')`;
}

function buildOrder(params: ListProductsParams): [SQL, SQL] {
  const column =
    params.sort === "name"
      ? products.name
      : params.sort === "price"
        ? products.priceCents
        : products.createdAt;
  const primary = params.order === "asc" ? asc(column) : desc(column);
  return [primary, asc(products.id)];
}
