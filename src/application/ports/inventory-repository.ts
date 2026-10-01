import type { Product } from "../../domain/entities/product.js";
import type {
  InventoryMovement,
  InventoryMovementType,
} from "../../domain/entities/sale.js";
import type { SortOrder } from "./product-repository.js";
export type MovementSortField = "createdAt" | "quantity";
export type MovementTypeFilter = InventoryMovementType;

export interface StockChange {
  productId: string;
  delta: number;
}

export type MovementDraft = Omit<InventoryMovement, "id">;

export interface ListMovementsParams {
  page: number;
  limit: number;
  productId?: string;
  type?: MovementTypeFilter;
  sort: MovementSortField;
  order: SortOrder;
}

export interface PagedMovements {
  rows: InventoryMovement[];
  total: number;
}

export interface MovementWriter {
  insert(movements: MovementDraft[]): Promise<void>;
  list(params: ListMovementsParams): Promise<PagedMovements>;
}

export interface InventoryWriteContext {
  findProductsForUpdate(productIds: string[]): Promise<Product[]>;
  applyStockChanges(changes: StockChange[]): Promise<void>;
  recordMovements(movements: MovementDraft[]): Promise<void>;
}

/**
 * Inventory owns stock adjustments and the movement ledger. Sales move stock
 * through their own aggregate, but both write the same ledger, so a product's
 * history stays reconstructable regardless of where a change came from.
 */
export interface InventoryRepository {
  transaction<T>(fn: (ctx: InventoryWriteContext) => Promise<T>): Promise<T>;
  movements: MovementWriter;
}
