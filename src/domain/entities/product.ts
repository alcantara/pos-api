import { DomainError } from "../errors/domain-error.js";

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
