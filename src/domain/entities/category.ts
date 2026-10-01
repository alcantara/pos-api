import { DomainError } from "../errors/domain-error.js";

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
