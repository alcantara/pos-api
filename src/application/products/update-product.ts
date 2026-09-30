import { ConflictError } from "../../domain/errors/domain-error.js";
import { type Product, ProductNotFoundError } from "../../domain/entities/product.js";
import type { ProductRepository } from "../ports/product-repository.js";

export interface UpdateProductInput {
  id: string;
  changes: {
    sku?: string;
    name?: string;
    description?: string | null;
    priceCents?: number;
    stockQuantity?: number;
  };
}

export async function updateProduct(
  repository: ProductRepository,
  input: UpdateProductInput,
): Promise<Product> {
  const current = await repository.findById(input.id);
  if (!current) {
    throw new ProductNotFoundError(input.id);
  }

  const { changes } = input;
  if (changes.sku !== undefined && changes.sku !== current.sku) {
    const bySku = await repository.findBySku(changes.sku);
    if (bySku) {
      throw new ConflictError(`A product with SKU "${changes.sku}" already exists`);
    }
  }

  const updated: Product = {
    ...current,
    sku: changes.sku ?? current.sku,
    name: changes.name ?? current.name,
    description:
      changes.description !== undefined ? changes.description : current.description,
    priceCents: changes.priceCents ?? current.priceCents,
    stockQuantity: changes.stockQuantity ?? current.stockQuantity,
    updatedAt: Date.now(),
  };

  await repository.update(updated);
  return updated;
}
