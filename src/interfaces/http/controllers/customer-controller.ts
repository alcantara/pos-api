import type { FastifyReply, FastifyRequest } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { createCustomer } from "../../../application/customers/create-customer.js";
import { deleteCustomer } from "../../../application/customers/delete-customer.js";
import { getCustomer } from "../../../application/customers/get-customer.js";
import { listCustomers } from "../../../application/customers/list-customers.js";
import { updateCustomer } from "../../../application/customers/update-customer.js";
import { API_PREFIX, withPage } from "../hateoas.js";
import { customerRepresentation } from "../mappers/customer-mapper.js";
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "../schemas/customer-schemas.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface CustomerController {
  list: Handler;
  create: Handler;
  get: Handler;
  update: Handler;
  remove: Handler;
}

export function createCustomerController(
  dependencies: Dependencies,
): CustomerController {
  return {
    list: async (request, reply) => {
      const query = listCustomersQuerySchema.parse(request.query);
      const page = await listCustomers(dependencies.customers, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        sort: query.sort,
        order: query.order,
      });

      const links: Record<string, { href: string; method?: "POST" }> = {
        self: { href: request.url },
        create: { href: `${API_PREFIX}/customers`, method: "POST" },
      };
      if (page.page > 1) {
        links.prev = { href: withPage(request.url, page.page - 1) };
      }
      if (page.page < page.totalPages) {
        links.next = { href: withPage(request.url, page.page + 1) };
      }

      return reply.code(200).send({
        data: page.customers.map(customerRepresentation),
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
      const input = createCustomerSchema.parse(request.body);
      const customer = await createCustomer(dependencies.customers, input);
      reply.header("Location", `${API_PREFIX}/customers/${customer.id}`);
      return reply.code(201).send(customerRepresentation(customer));
    },

    get: async (request, reply) => {
      const { id } = customerIdParamsSchema.parse(request.params);
      const customer = await getCustomer(dependencies.customers, id);
      return reply.code(200).send(customerRepresentation(customer));
    },

    update: async (request, reply) => {
      const { id } = customerIdParamsSchema.parse(request.params);
      const changes = updateCustomerSchema.parse(request.body);
      const customer = await updateCustomer(dependencies.customers, {
        id,
        changes,
      });
      return reply.code(200).send(customerRepresentation(customer));
    },

    remove: async (request, reply) => {
      const { id } = customerIdParamsSchema.parse(request.params);
      await deleteCustomer(dependencies.customers, id);
      return reply.code(204).send();
    },
  };
}
