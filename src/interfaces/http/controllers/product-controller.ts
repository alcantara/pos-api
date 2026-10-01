import type { FastifyReply, FastifyRequest } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { createProduct } from "../../../application/products/create-product.js";
import { deleteProduct } from "../../../application/products/delete-product.js";
import { getProduct } from "../../../application/products/get-product.js";
import { listProducts } from "../../../application/products/list-products.js";
import { updateProduct } from "../../../application/products/update-product.js";
import { API_PREFIX, withPage } from "../hateoas.js";
import { productRepresentation } from "../mappers/product-mapper.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductSchema,
} from "../schemas/product-schemas.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface ProductController {
  list: Handler;
  create: Handler;
  get: Handler;
  update: Handler;
  remove: Handler;
}

export function createProductController(dependencies: Dependencies): ProductController {
  return {
    list: async (request, reply) => {
      const query = listProductsQuerySchema.parse(request.query);
      const page = await listProducts(dependencies.products, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        sort: query.sort,
        order: query.order,
      });

      const links: Record<string, { href: string; method?: "POST" }> = {
        self: { href: request.url },
        create: { href: `${API_PREFIX}/products`, method: "POST" },
      };
      if (page.page > 1) {
        links.prev = { href: withPage(request.url, page.page - 1) };
      }
      if (page.page < page.totalPages) {
        links.next = { href: withPage(request.url, page.page + 1) };
      }

      return reply.code(200).send({
        data: page.products.map(productRepresentation),
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
      const input = createProductSchema.parse(request.body);
      const product = await createProduct(
        dependencies.products,
        dependencies.categories,
        input,
      );
      reply.header("Location", `${API_PREFIX}/products/${product.id}`);
      return reply.code(201).send(productRepresentation(product));
    },

    get: async (request, reply) => {
      const { id } = productIdParamsSchema.parse(request.params);
      const product = await getProduct(dependencies.products, id);
      return reply.code(200).send(productRepresentation(product));
    },

    update: async (request, reply) => {
      const { id } = productIdParamsSchema.parse(request.params);
      const changes = updateProductSchema.parse(request.body);
      const product = await updateProduct(
        dependencies.products,
        dependencies.categories,
        {
          id,
          changes,
        },
      );
      return reply.code(200).send(productRepresentation(product));
    },

    remove: async (request, reply) => {
      const { id } = productIdParamsSchema.parse(request.params);
      await deleteProduct(dependencies.products, id);
      return reply.code(204).send();
    },
  };
}
