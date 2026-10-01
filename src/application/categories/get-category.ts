import {
  type Category,
  CategoryNotFoundError,
} from "../../domain/entities/category.js";
import type { CategoryRepository } from "../ports/category-repository.js";

export async function getCategory(
  repository: CategoryRepository,
  id: string,
): Promise<Category> {
  const category = await repository.findById(id);
  if (!category) {
    throw new CategoryNotFoundError(id);
  }
  return category;
}
