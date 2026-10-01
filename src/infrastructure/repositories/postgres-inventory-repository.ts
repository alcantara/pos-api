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
import type { PgContext, PostgresDatabase } from "../database/postgres.js";
import { inventoryMovements, products } from "../database/schema/postgres.js";

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

function buildFilter(params: ListMovementsParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.productId)
    conditions.push(eq(inventoryMovements.productId, params.productId));
  if (params.type) conditions.push(eq(inventoryMovements.type, params.type));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

class PostgresInventoryWriteContext implements InventoryWriteContext {
  constructor(private readonly ctx: PgContext) {}

  async findProductsForUpdate(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) return [];
    return this.ctx.db
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
      .for("update");
  }

  async applyStockChanges(changes: StockChange[]): Promise<void> {
    for (const change of changes) {
      await this.ctx.db
        .update(products)
        .set({ stockQuantity: sql`${products.stockQuantity} + ${change.delta}` })
        .where(eq(products.id, change.productId));
    }
  }

  async recordMovements(movements: MovementDraft[]): Promise<void> {
    if (movements.length === 0) return;
    await this.ctx.db
      .insert(inventoryMovements)
      .values(movements.map((movement) => ({ id: randomUUID(), ...movement })));
  }
}

class PostgresMovementWriter implements MovementWriter {
  constructor(private readonly database: PostgresDatabase) {}

  async insert(movements: MovementDraft[]): Promise<void> {
    if (movements.length === 0) return;
    const db = this.database.context.db;
    await db
      .insert(inventoryMovements)
      .values(movements.map((movement) => ({ id: randomUUID(), ...movement })));
  }

  async list(params: ListMovementsParams): Promise<PagedMovements> {
    const db = this.database.context.db;
    const where = buildFilter(params);
    const column =
      params.sort === "quantity"
        ? inventoryMovements.quantity
        : inventoryMovements.createdAt;
    const primary = params.order === "asc" ? asc(column) : desc(column);
    const offset = (params.page - 1) * params.limit;

    const [rows, counts] = await Promise.all([
      db
        .select()
        .from(inventoryMovements)
        .where(where)
        .orderBy(primary, asc(inventoryMovements.id))
        .limit(params.limit)
        .offset(offset),
      db.select({ total: count() }).from(inventoryMovements).where(where),
    ]);

    return { rows: rows.map(toMovement), total: counts[0]?.total ?? 0 };
  }
}

export class PostgresInventoryRepository implements InventoryRepository {
  readonly movements: MovementWriter;

  constructor(private readonly database: PostgresDatabase) {
    this.movements = new PostgresMovementWriter(database);
  }

  async transaction<T>(fn: (ctx: InventoryWriteContext) => Promise<T>): Promise<T> {
    return this.database.transaction((ctx) =>
      fn(new PostgresInventoryWriteContext(ctx)),
    );
  }
}
