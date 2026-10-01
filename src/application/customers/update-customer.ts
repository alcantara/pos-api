import {
  type Customer,
  CustomerNotFoundError,
} from "../../domain/entities/customer.js";
import { ConflictError } from "../../domain/errors/domain-error.js";
import type { CustomerRepository } from "../ports/customer-repository.js";

export interface UpdateCustomerInput {
  id: string;
  changes: {
    name?: string;
    email?: string | null;
    phone?: string | null;
  };
}

export async function updateCustomer(
  repository: CustomerRepository,
  input: UpdateCustomerInput,
): Promise<Customer> {
  const current = await repository.findById(input.id);
  if (!current) {
    throw new CustomerNotFoundError(input.id);
  }

  const { changes } = input;
  if (changes.email !== undefined && changes.email !== current.email) {
    if (changes.email) {
      const byEmail = await repository.findByEmail(changes.email);
      if (byEmail) {
        throw new ConflictError(
          `A customer with email "${changes.email}" already exists`,
        );
      }
    }
  }

  const updated: Customer = {
    ...current,
    name: changes.name ?? current.name,
    email: changes.email !== undefined ? changes.email : current.email,
    phone: changes.phone !== undefined ? changes.phone : current.phone,
    updatedAt: Date.now(),
  };

  await repository.update(updated);
  return updated;
}
