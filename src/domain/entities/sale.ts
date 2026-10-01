import { DomainError } from "../errors/domain-error.js";

export type SaleStatus = "COMPLETED" | "CANCELLED";

export type InventoryMovementType =
  "SALE" | "PURCHASE" | "ADJUSTMENT" | "RETURN" | "CANCELLATION";

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface Sale {
  id: string;
  customerId: string | null;
  userId: string;
  totalCents: number;
  status: SaleStatus;
  createdAt: number;
  updatedAt: number;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
}

export interface InventoryMovement {
  id: string;
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  reason: string | null;
  createdAt: number;
}

export function lineSubtotalCents(quantity: number, unitPriceCents: number): number {
  return quantity * unitPriceCents;
}

export class SaleNotFoundError extends DomainError {
  readonly code = "SALE_NOT_FOUND";

  constructor(id?: string) {
    super(id ? `Sale ${id} not found` : "Sale not found");
  }
}

export class InsufficientStockError extends DomainError {
  readonly code = "INSUFFICIENT_STOCK";

  constructor(productId: string, requested: number, available: number) {
    super(
      `Product ${productId} has ${available} in stock, but ${requested} were requested`,
    );
  }
}

export class SaleAlreadyCancelledError extends DomainError {
  readonly code = "CONFLICT";

  constructor(id?: string) {
    super(id ? `Sale ${id} is already cancelled` : "Sale is already cancelled");
  }
}
