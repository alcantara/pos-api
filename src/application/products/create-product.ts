import { randomUUID } from "node:crypto";
import { ConflictError } from "../../domain/errors/domain-error.js";
import type { Product } from "../../domain/entities/product.js";
import type { ProductRepository } from "../ports/product-repository.js";

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string | null;
  priceCents: number;
  stockQuantity?: number;
}

/**
 * Input is validated at the HTTP boundary (Zod); this use case coordinates
 * uniqueness and persistence.
 */
export async function createProduct(
  repository: ProductRepository,
  input: CreateProductInput,
): Promise<Product> {
  const existing = await repository.findBySku(input.sku);
  if (existing) {
    throw new ConflictError(`A product with SKU "${input.sku}" already exists`);
  }

  const now = Date.now();
  const product: Product = {
    id: randomUUID(),
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    priceCents: input.priceCents,
    stockQuantity: input.stockQuantity ?? 0,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
  };

  await repository.insert(product);
  return product;
}
