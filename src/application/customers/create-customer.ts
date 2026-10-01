import { randomUUID } from "node:crypto";
import { ConflictError } from "../../domain/errors/domain-error.js";
import type { Customer } from "../../domain/entities/customer.js";
import type { CustomerRepository } from "../ports/customer-repository.js";

export interface CreateCustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
}

/** Input is validated at the HTTP boundary (Zod); this coordinates uniqueness. */
export async function createCustomer(
  repository: CustomerRepository,
  input: CreateCustomerInput,
): Promise<Customer> {
  const email = input.email ?? null;
  if (email) {
    const existing = await repository.findByEmail(email);
    if (existing) {
      throw new ConflictError(
        `A customer with email "${email}" already exists`,
      );
    }
  }

  const now = Date.now();
  const customer: Customer = {
    id: randomUUID(),
    name: input.name,
    email,
    phone: input.phone ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await repository.insert(customer);
  return customer;
}
