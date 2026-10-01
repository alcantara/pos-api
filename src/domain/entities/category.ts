import { DomainError } from "../errors/domain-error.js";

/**
 * A product grouping. Names are unique; products reference a category
 * optionally (`products.category_id` is `ON DELETE SET NULL`).
 * Timestamps are epoch milliseconds (UTC).
 */
export interface Category {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export class CategoryNotFoundError extends DomainError {
  readonly code = "CATEGORY_NOT_FOUND";

  constructor(id?: string) {
    super(id ? `Category ${id} not found` : "Category not found");
  }
}
