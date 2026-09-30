import { DomainError } from "../errors/domain-error.js";

/**
 * A sellable product. Monetary values are integer cents; timestamps are
 * epoch milliseconds (UTC).
 */
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  stockQuantity: number;
  categoryId: string | null;
  createdAt: number;
  updatedAt: number;
}

export class ProductNotFoundError extends DomainError {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor(id?: string) {
    super(id ? `Product ${id} not found` : "Product not found");
  }
}
