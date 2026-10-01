import { ProductNotFoundError } from "../../domain/entities/product.js";
import type { ProductRepository } from "../ports/product-repository.js";

export async function deleteProduct(
  repository: ProductRepository,
  id: string,
): Promise<void> {
  const product = await repository.findById(id);
  if (!product) {
    throw new ProductNotFoundError(id);
  }
  await repository.delete(id);
}
