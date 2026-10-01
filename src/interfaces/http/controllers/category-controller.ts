import type { FastifyReply, FastifyRequest } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { createCategory } from "../../../application/categories/create-category.js";
import { deleteCategory } from "../../../application/categories/delete-category.js";
import { getCategory } from "../../../application/categories/get-category.js";
import { listCategories } from "../../../application/categories/list-categories.js";
import { updateCategory } from "../../../application/categories/update-category.js";
import { API_PREFIX, withPage } from "../hateoas.js";
import { categoryRepresentation } from "../mappers/category-mapper.js";
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "../schemas/category-schemas.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface CategoryController {
  list: Handler;
  create: Handler;
  get: Handler;
  update: Handler;
  remove: Handler;
}

export function createCategoryController(
  dependencies: Dependencies,
): CategoryController {
  return {
    list: async (request, reply) => {
      const query = listCategoriesQuerySchema.parse(request.query);
      const page = await listCategories(dependencies.categories, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        sort: query.sort,
        order: query.order,
      });

      const links: Record<string, { href: string; method?: "POST" }> = {
        self: { href: request.url },
        create: { href: `${API_PREFIX}/categories`, method: "POST" },
      };
      if (page.page > 1) {
        links.prev = { href: withPage(request.url, page.page - 1) };
      }
      if (page.page < page.totalPages) {
        links.next = { href: withPage(request.url, page.page + 1) };
      }

      return reply.code(200).send({
        data: page.categories.map(categoryRepresentation),
        pagination: {
          page: page.page,
          limit: page.limit,
          total: page.total,
          totalPages: page.totalPages,
        },
        _links: links,
      });
    },

    create: async (request, reply) => {
      const input = createCategorySchema.parse(request.body);
      const category = await createCategory(dependencies.categories, input);
      reply.header("Location", `${API_PREFIX}/categories/${category.id}`);
      return reply.code(201).send(categoryRepresentation(category));
    },

    get: async (request, reply) => {
      const { id } = categoryIdParamsSchema.parse(request.params);
      const category = await getCategory(dependencies.categories, id);
      return reply.code(200).send(categoryRepresentation(category));
    },

    update: async (request, reply) => {
      const { id } = categoryIdParamsSchema.parse(request.params);
      const changes = updateCategorySchema.parse(request.body);
      const category = await updateCategory(dependencies.categories, {
        id,
        changes,
      });
      return reply.code(200).send(categoryRepresentation(category));
    },

    remove: async (request, reply) => {
      const { id } = categoryIdParamsSchema.parse(request.params);
      await deleteCategory(dependencies.categories, id);
      return reply.code(204).send();
    },
  };
}
