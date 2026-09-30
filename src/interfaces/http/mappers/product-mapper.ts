import type { Product } from "../../../domain/entities/product.js";
import { productLinks } from "../hateoas.js";

/**
 * Presentation mapping: HTTP representation differs from the domain —
 * timestamps become ISO 8601 strings (epoch milliseconds stay internal) and
 * HATEOAS links are attached.
 */
export function productRepresentation(product: Product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    stockQuantity: product.stockQuantity,
    categoryId: product.categoryId,
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: new Date(product.updatedAt).toISOString(),
    _links: productLinks(product.id),
  };
}
