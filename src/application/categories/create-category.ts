import { randomUUID } from "node:crypto";
import type { Category } from "../../domain/entities/category.js";
import { ConflictError } from "../../domain/errors/domain-error.js";
import type { CategoryRepository } from "../ports/category-repository.js";

export interface CreateCategoryInput {
  name: string;
}

/** Input is validated at the HTTP boundary (Zod); this coordinates uniqueness. */
export async function createCategory(
  repository: CategoryRepository,
  input: CreateCategoryInput,
): Promise<Category> {
  const existing = await repository.findByName(input.name);
  if (existing) {
    throw new ConflictError(`A category named "${input.name}" already exists`);
  }

  const now = Date.now();
  const category: Category = {
    id: randomUUID(),
    name: input.name,
    createdAt: now,
    updatedAt: now,
  };

  await repository.insert(category);
  return category;
}
