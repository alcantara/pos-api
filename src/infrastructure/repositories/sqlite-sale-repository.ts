import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type {
  MovementDraft,
  StockChange,
} from "../../application/ports/inventory-repository.js";
import type {
  ListSalesParams,
  PagedSales,
  SaleRepository,
  SaleWriteContext,
} from "../../application/ports/sale-repository.js";
import type { Product } from "../../domain/entities/product.js";
import type {
  Sale,
  SaleItem,
  SaleStatus,
  SaleWithItems,
} from "../../domain/entities/sale.js";
import type { SqliteContext } from "../database/sqlite.js";
import type { SqliteDatabase } from "../database/sqlite.js";
import {
  inventoryMovements,
  products,
  saleItems,
  sales,
} from "../database/schema/sqlite.js";

class SqliteSaleWriteContext implements SaleWriteContext {
  constructor(private readonly ctx: SqliteContext) {}

  async findProductsForUpdate(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) return [];
    return this.ctx.guard(async () =>
      this.ctx.db.select().from(products).where(inArray(products.id, productIds)),
    );
  }

  async findSaleForUpdate(id: string): Promise<SaleWithItems | null> {
    return this.ctx.guard(async () => loadSale(this.ctx, id));
  }

  async insertSale(sale: Sale): Promise<void> {
    await this.ctx.guard(async () => {
      await this.ctx.db.insert(sales).values(sale);
    });
  }

  async insertSaleItems(items: SaleItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.ctx.guard(async () => {
      await this.ctx.db.insert(saleItems).values(items);
    });
  }

  async updateSale(sale: Sale): Promise<void> {
    await this.ctx.guard(async () => {
      await this.ctx.db
        .update(sales)
        .set({ status: sale.status, updatedAt: sale.updatedAt })
        .where(eq(sales.id, sale.id));
    });
  }

  async applyStockChanges(changes: StockChange[]): Promise<void> {
    for (const change of changes) {
      await this.ctx.guard(async () => {
        await this.ctx.db
          .update(products)
          .set({ stockQuantity: sql`${products.stockQuantity} + ${change.delta}` })
          .where(eq(products.id, change.productId));
      });
    }
  }

  async recordMovements(movements: MovementDraft[]): Promise<void> {
    if (movements.length === 0) return;
    await this.ctx.guard(async () => {
      await this.ctx.db
        .insert(inventoryMovements)
        .values(movements.map((movement) => ({ id: randomUUID(), ...movement })));
    });
  }
}

type SaleRow = typeof sales.$inferSelect;

function toSale(row: SaleRow): Sale {
  if (row.status !== "COMPLETED" && row.status !== "CANCELLED") {
    throw new Error(`Unexpected sales.status value: ${row.status}`);
  }
  return { ...row, status: row.status satisfies SaleStatus };
}

async function loadSale(ctx: SqliteContext, id: string): Promise<SaleWithItems | null> {
  const [row] = await ctx.db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!row) return null;
  const items = await ctx.db.select().from(saleItems).where(eq(saleItems.saleId, id));
  return { ...toSale(row), items };
}

export class SqliteSaleRepository implements SaleRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async transaction<T>(fn: (ctx: SaleWriteContext) => Promise<T>): Promise<T> {
    return this.database.transaction((ctx) => fn(new SqliteSaleWriteContext(ctx)));
  }

  async findById(id: string): Promise<SaleWithItems | null> {
    return this.database.context.guard(async () => loadSale(this.database.context, id));
  }

  async list(params: ListSalesParams): Promise<PagedSales> {
    const ctx = this.database.context;
    const where = buildFilter(params);
    const column = params.sort === "totalCents" ? sales.totalCents : sales.createdAt;
    const primary = params.order === "asc" ? asc(column) : desc(column);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await ctx.guard(async () => {
      const rowsQuery = ctx.db
        .select()
        .from(sales)
        .where(where)
        .orderBy(primary, asc(sales.id))
        .limit(params.limit)
        .offset(offset);
      const countQuery = ctx.db.select({ total: count() }).from(sales).where(where);
      return Promise.all([rowsQuery, countQuery]);
    });

    return { rows: rows.map(toSale), total: counts[0]?.total ?? 0 };
  }
}

function buildFilter(params: ListSalesParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.status) conditions.push(eq(sales.status, params.status));
  if (params.customerId) conditions.push(eq(sales.customerId, params.customerId));
  return conditions.length > 0 ? and(...conditions) : undefined;
}
