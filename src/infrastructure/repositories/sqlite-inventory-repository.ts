import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type {
  InventoryRepository,
  InventoryWriteContext,
  ListMovementsParams,
  MovementDraft,
  MovementWriter,
  PagedMovements,
  StockChange,
} from "../../application/ports/inventory-repository.js";
import type { Product } from "../../domain/entities/product.js";
import type {
  InventoryMovement,
  InventoryMovementType,
} from "../../domain/entities/sale.js";
import type { SqliteContext } from "../database/sqlite.js";
import type { SqliteDatabase } from "../database/sqlite.js";
import { inventoryMovements, products } from "../database/schema/sqlite.js";

type MovementRow = typeof inventoryMovements.$inferSelect;

function toMovement(row: MovementRow): InventoryMovement {
  const types: InventoryMovementType[] = [
    "SALE",
    "PURCHASE",
    "ADJUSTMENT",
    "RETURN",
    "CANCELLATION",
  ];
  if (!types.includes(row.type as InventoryMovementType)) {
    throw new Error(`Unexpected inventory_movements.type value: ${row.type}`);
  }
  return { ...row, type: row.type as InventoryMovementType };
}

class SqliteInventoryWriteContext implements InventoryWriteContext {
  constructor(private readonly ctx: SqliteContext) {}

  async findProductsForUpdate(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) return [];
    return this.ctx.guard(async () =>
      this.ctx.db.select().from(products).where(inArray(products.id, productIds)),
    );
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

class SqliteMovementWriter implements MovementWriter {
  constructor(private readonly database: SqliteDatabase) {}

  async insert(movements: MovementDraft[]): Promise<void> {
    if (movements.length === 0) return;
    const ctx = this.database.context;
    await ctx.guard(async () => {
      await ctx.db
        .insert(inventoryMovements)
        .values(movements.map((movement) => ({ id: randomUUID(), ...movement })));
    });
  }

  async list(params: ListMovementsParams): Promise<PagedMovements> {
    const ctx = this.database.context;
    const where = buildFilter(params);
    const column =
      params.sort === "quantity"
        ? inventoryMovements.quantity
        : inventoryMovements.createdAt;
    const primary = params.order === "asc" ? asc(column) : desc(column);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await ctx.guard(async () => {
      const rowsQuery = ctx.db
        .select()
        .from(inventoryMovements)
        .where(where)
        .orderBy(primary, asc(inventoryMovements.id))
        .limit(params.limit)
        .offset(offset);
      const countQuery = ctx.db
        .select({ total: count() })
        .from(inventoryMovements)
        .where(where);
      return Promise.all([rowsQuery, countQuery]);
    });

    return { rows: rows.map(toMovement), total: counts[0]?.total ?? 0 };
  }
}

export class SqliteInventoryRepository implements InventoryRepository {
  readonly movements: MovementWriter;

  constructor(private readonly database: SqliteDatabase) {
    this.movements = new SqliteMovementWriter(database);
  }

  async transaction<T>(fn: (ctx: InventoryWriteContext) => Promise<T>): Promise<T> {
    return this.database.transaction((ctx) => fn(new SqliteInventoryWriteContext(ctx)));
  }
}

function buildFilter(params: ListMovementsParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.productId)
    conditions.push(eq(inventoryMovements.productId, params.productId));
  if (params.type) conditions.push(eq(inventoryMovements.type, params.type));
  return conditions.length > 0 ? and(...conditions) : undefined;
}
