import { type Product, ProductNotFoundError } from "../../domain/entities/product.js";
import type { ProductRepository } from "../ports/product-repository.js";

export async function getProduct(
  repository: ProductRepository,
  id: string,
): Promise<Product> {
  const product = await repository.findById(id);
  if (!product) {
    throw new ProductNotFoundError(id);
  }
  return product;
}
