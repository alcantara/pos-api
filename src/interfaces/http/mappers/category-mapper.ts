import type { Category } from "../../../domain/entities/category.js";
import { categoryLinks } from "../hateoas.js";

/**
 * Presentation mapping: HTTP representation differs from the domain —
 * timestamps become ISO 8601 strings (epoch milliseconds stay internal) and
 * HATEOAS links are attached.
 */
export function categoryRepresentation(category: Category) {
  return {
    id: category.id,
    name: category.name,
    createdAt: new Date(category.createdAt).toISOString(),
    updatedAt: new Date(category.updatedAt).toISOString(),
    _links: categoryLinks(category.id),
  };
}
