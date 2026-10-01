import type { FastifyReply, FastifyRequest } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { adjustStock } from "../../../application/inventory/adjust-stock.js";
import { listMovements } from "../../../application/inventory/list-movements.js";
import { API_PREFIX, withPage } from "../hateoas.js";
import { movementRepresentation } from "../mappers/inventory-mapper.js";
import {
  adjustStockSchema,
  listMovementsQuerySchema,
} from "../schemas/inventory-schemas.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface InventoryController {
  adjust: Handler;
  listMovements: Handler;
}

export function createInventoryController(
  dependencies: Dependencies,
): InventoryController {
  return {
    adjust: async (request, reply) => {
      const input = adjustStockSchema.parse(request.body);
      const movement = await adjustStock(dependencies.inventory, input);

      reply.header(
        "Location",
        `${API_PREFIX}/inventory/movements?productId=${movement.productId}`,
      );
      return reply.code(201).send(movementRepresentation(movement));
    },

    listMovements: async (request, reply) => {
      const query = listMovementsQuerySchema.parse(request.query);
      const page = await listMovements(dependencies.inventory, {
        page: query.page,
        limit: query.limit,
        productId: query.productId,
        type: query.type,
        sort: query.sort,
        order: query.order,
      });

      const links: Record<string, { href: string; method?: "POST" }> = {
        self: { href: request.url },
      };
      if (page.page > 1) {
        links.prev = { href: withPage(request.url, page.page - 1) };
      }
      if (page.page < page.totalPages) {
        links.next = { href: withPage(request.url, page.page + 1) };
      }

      return reply.code(200).send({
        data: page.movements.map(movementRepresentation),
        pagination: {
          page: page.page,
          limit: page.limit,
          total: page.total,
          totalPages: page.totalPages,
        },
        _links: links,
      });
    },
  };
}
