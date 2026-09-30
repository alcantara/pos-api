import type { Product } from "../../domain/entities/product.js";

export type ProductSortField = "name" | "price" | "createdAt";
export type SortOrder = "asc" | "desc";

export interface ListProductsParams {
  page: number;
  limit: number;
  search?: string;
  sort: ProductSortField;
  order: SortOrder;
}

export interface PagedProducts {
  rows: Product[];
  total: number;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  insert(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
  delete(id: string): Promise<void>;
  list(params: ListProductsParams): Promise<PagedProducts>;
}
