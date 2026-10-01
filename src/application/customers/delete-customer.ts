import { CustomerNotFoundError } from "../../domain/entities/customer.js";
import type { CustomerRepository } from "../ports/customer-repository.js";

/**
 * Sales reference customers with `ON DELETE RESTRICT`, so deleting a customer
 * that has sales is rejected by the database and surfaced as a conflict.
 */
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
