import type { Product } from "../../../domain/entities/product.js";
import { productLinks } from "../hateoas.js";

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
