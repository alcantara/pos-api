import {
  type Category,
  CategoryNotFoundError,
} from "../../domain/entities/category.js";
import { ConflictError } from "../../domain/errors/domain-error.js";
import type { CategoryRepository } from "../ports/category-repository.js";

export interface UpdateCategoryInput {
  id: string;
  changes: {
    name?: string;
  };
}

export async function updateCategory(
  repository: CategoryRepository,
  input: UpdateCategoryInput,
): Promise<Category> {
  const current = await repository.findById(input.id);
  if (!current) {
    throw new CategoryNotFoundError(input.id);
  }

  const { changes } = input;
  if (changes.name !== undefined && changes.name !== current.name) {
    const byName = await repository.findByName(changes.name);
    if (byName) {
      throw new ConflictError(`A category named "${changes.name}" already exists`);
    }
  }

  const updated: Category = {
    ...current,
    name: changes.name ?? current.name,
    updatedAt: Date.now(),
  };

  await repository.update(updated);
  return updated;
}
