import { CustomerNotFoundError } from "../../domain/entities/customer.js";
import type { CustomerRepository } from "../ports/customer-repository.js";

export async function deleteCustomer(
  repository: CustomerRepository,
  id: string,
): Promise<void> {
  const customer = await repository.findById(id);
  if (!customer) {
    throw new CustomerNotFoundError(id);
  }

  await repository.delete(id);
}
