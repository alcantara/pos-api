import type { Product } from "../../domain/entities/product.js";
import type {
  ListProductsParams,
  ProductRepository,
} from "../ports/product-repository.js";

export interface ProductPage {
  products: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listProducts(
  repository: ProductRepository,
  params: ListProductsParams,
): Promise<ProductPage> {
  const { rows, total } = await repository.list(params);
  return {
    products: rows,
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}
