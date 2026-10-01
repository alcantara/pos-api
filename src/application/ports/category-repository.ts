import type { Category } from "../../domain/entities/category.js";
import type { SortOrder } from "./product-repository.js";

export type CategorySortField = "name" | "createdAt";

export interface ListCategoriesParams {
  page: number;
  limit: number;
  search?: string;
  sort: CategorySortField;
  order: SortOrder;
}

export interface PagedCategories {
  rows: Category[];
  total: number;
}

/**
 * Narrow port for validating references from other aggregates (products)
 * without depending on the full category repository.
 */
export interface CategoryLookup {
  findById(id: string): Promise<Category | null>;
}

export interface CategoryRepository extends CategoryLookup {
  findByName(name: string): Promise<Category | null>;
  insert(category: Category): Promise<void>;
  update(category: Category): Promise<void>;
  delete(id: string): Promise<void>;
  list(params: ListCategoriesParams): Promise<PagedCategories>;
}
