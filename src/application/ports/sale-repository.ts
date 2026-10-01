import type {
  Sale,
  SaleItem,
  SaleStatus,
  SaleWithItems,
} from "../../domain/entities/sale.js";
import type { Product } from "../../domain/entities/product.js";
import type { IdempotencyClaim } from "./idempotency-repository.js";
import type { MovementDraft, StockChange } from "./inventory-repository.js";
import type { SortOrder } from "./product-repository.js";

export type SaleSortField = "createdAt" | "totalCents";

export interface ListSalesParams {
  page: number;
  limit: number;
  status?: SaleStatus;
  customerId?: string;
  sort: SaleSortField;
  order: SortOrder;
}

export interface PagedSales {
  rows: Sale[];
  total: number;
}

/**
 * Transaction-scoped writer for the sales aggregate. Reads that decide stock
 * and prices must run inside the same transaction as the writes they guard,
 * so implementations lock the rows they read (PostgreSQL `FOR UPDATE`,
 * SQLite `BEGIN IMMEDIATE`).
 */
export interface SaleWriteContext {
  findProductsForUpdate(productIds: string[]): Promise<Product[]>;
  findSaleForUpdate(id: string): Promise<SaleWithItems | null>;
  insertSale(sale: Sale): Promise<void>;
  insertSaleItems(items: SaleItem[]): Promise<void>;
  updateSale(sale: Sale): Promise<void>;
  applyStockChanges(changes: StockChange[]): Promise<void>;
  recordMovements(movements: MovementDraft[]): Promise<void>;
  /**
   * Optional: present when the request carries an `Idempotency-Key`. The record
   * is written in this transaction, so the key and the sale commit together.
   */
  claimIdempotency?(claim: IdempotencyClaim): Promise<void>;
}

export interface SaleRepository {
  transaction<T>(fn: (ctx: SaleWriteContext) => Promise<T>): Promise<T>;
  findById(id: string): Promise<SaleWithItems | null>;
  list(params: ListSalesParams): Promise<PagedSales>;
}
