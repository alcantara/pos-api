import type { Customer } from "../../../domain/entities/customer.js";
import { customerLinks } from "../hateoas.js";

/**
 * Presentation mapping: HTTP representation differs from the domain —
 * timestamps become ISO 8601 strings (epoch milliseconds stay internal) and
 * HATEOAS links are attached.
 */
export function customerRepresentation(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    createdAt: new Date(customer.createdAt).toISOString(),
    updatedAt: new Date(customer.updatedAt).toISOString(),
    _links: customerLinks(customer.id),
  };
}
