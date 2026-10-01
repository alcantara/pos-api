import type { Category } from "../../domain/entities/category.js";
import type {
  CategoryRepository,
  ListCategoriesParams,
} from "../ports/category-repository.js";

export interface CategoryPage {
  categories: Category[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listCategories(
  repository: CategoryRepository,
  params: ListCategoriesParams,
): Promise<CategoryPage> {
  const { rows, total } = await repository.list(params);
  return {
    categories: rows,
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}
