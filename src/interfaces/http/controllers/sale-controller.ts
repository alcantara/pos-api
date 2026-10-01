import type { FastifyReply, FastifyRequest } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { cancelSale } from "../../../application/sales/cancel-sale.js";
import { createSaleIdempotently } from "../../../application/sales/create-sale-idempotently.js";
import { getSale } from "../../../application/sales/get-sale.js";
import { listSales } from "../../../application/sales/list-sales.js";
import { resolveCurrentUser } from "../authz.js";
import { API_PREFIX, withPage } from "../hateoas.js";
import { saleRepresentation } from "../mappers/sale-mapper.js";
import {
  createSaleSchema,
  IDEMPOTENCY_HEADER,
  idempotencyKeySchema,
  listSalesQuerySchema,
  saleIdParamsSchema,
} from "../schemas/sale-schemas.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface SaleController {
  list: Handler;
  create: Handler;
  get: Handler;
  cancel: Handler;
}

export function createSaleController(
  dependencies: Dependencies,
  cookieSecret: string,
): SaleController {
  return {
    list: async (request, reply) => {
      const query = listSalesQuerySchema.parse(request.query);
      const page = await listSales(dependencies.sales, {
        page: query.page,
        limit: query.limit,
        status: query.status,
        customerId: query.customerId,
        sort: query.sort,
        order: query.order,
      });

      const links: Record<string, { href: string; method?: "POST" }> = {
        self: { href: request.url },
        create: { href: `${API_PREFIX}/sales`, method: "POST" },
      };
      if (page.page > 1) {
        links.prev = { href: withPage(request.url, page.page - 1) };
      }
      if (page.page < page.totalPages) {
        links.next = { href: withPage(request.url, page.page + 1) };
      }

      return reply.code(200).send({
        data: page.sales,
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
      const input = createSaleSchema.parse(request.body);
      const actor = await resolveCurrentUser(request, dependencies, cookieSecret);
      const rawKey = request.headers[IDEMPOTENCY_HEADER];
      const idempotencyKey =
        rawKey === undefined ? undefined : idempotencyKeySchema.parse(rawKey);

      const outcome = await createSaleIdempotently(
        dependencies.sales,
        dependencies.idempotency,
        {
          customerId: input.customerId ?? null,
          userId: actor.id,
          items: input.items,
        },
        idempotencyKey ? { idempotencyKey } : {},
      );

      if (outcome.replayed) {
        reply.header("idempotent-replayed", "true");
        reply.header("location", `${API_PREFIX}/sales/${outcome.sale.id}`);
        return reply.code(200).send(saleRepresentation(outcome.sale));
      }

      reply.header("Location", `${API_PREFIX}/sales/${outcome.sale.id}`);
      return reply.code(201).send(saleRepresentation(outcome.sale));
    },

    get: async (request, reply) => {
      const { id } = saleIdParamsSchema.parse(request.params);
      const sale = await getSale(dependencies.sales, id);
      return reply.code(200).send(saleRepresentation(sale));
    },

    cancel: async (request, reply) => {
      const { id } = saleIdParamsSchema.parse(request.params);
      const sale = await cancelSale(dependencies.sales, id);
      return reply.code(200).send(saleRepresentation(sale));
    },
  };
}
