import {
  type Customer,
  CustomerNotFoundError,
} from "../../domain/entities/customer.js";
import type { CustomerRepository } from "../ports/customer-repository.js";

export async function getCustomer(
  repository: CustomerRepository,
  id: string,
): Promise<Customer> {
  const customer = await repository.findById(id);
  if (!customer) {
    throw new CustomerNotFoundError(id);
  }
  return customer;
}
