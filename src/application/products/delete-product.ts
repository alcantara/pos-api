import { ProductNotFoundError } from "../../domain/entities/product.js";
import type { ProductRepository } from "../ports/product-repository.js";

/**
 * Deletes a product. The repository raises `ConflictError` when the product
 * is still referenced by sales or inventory history.
 */
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
