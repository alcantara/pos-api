import type { Customer } from "../../../domain/entities/customer.js";
import { customerLinks } from "../hateoas.js";

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
