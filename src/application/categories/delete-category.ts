import { CategoryNotFoundError } from "../../domain/entities/category.js";
import type { CategoryRepository } from "../ports/category-repository.js";

/**
 * Products keep existing when their category is removed: the foreign key is
 * `ON DELETE SET NULL`, so only the association is cleared.
 */
export async function deleteCategory(
  repository: CategoryRepository,
  id: string,
): Promise<void> {
  const category = await repository.findById(id);
  if (!category) {
    throw new CategoryNotFoundError(id);
  }

  await repository.delete(id);
}
