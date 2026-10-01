import type { Category } from "../../../domain/entities/category.js";
import { categoryLinks } from "../hateoas.js";

export function categoryRepresentation(category: Category) {
  return {
    id: category.id,
    name: category.name,
    createdAt: new Date(category.createdAt).toISOString(),
    updatedAt: new Date(category.updatedAt).toISOString(),
    _links: categoryLinks(category.id),
  };
}
