import type { Customer } from "../../domain/entities/customer.js";
import type {
  CustomerRepository,
  ListCustomersParams,
} from "../ports/customer-repository.js";

export interface CustomerPage {
  customers: Customer[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function listCustomers(
  repository: CustomerRepository,
  params: ListCustomersParams,
): Promise<CustomerPage> {
  const { rows, total } = await repository.list(params);
  return {
    customers: rows,
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}
