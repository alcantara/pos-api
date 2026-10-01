import type { Customer } from "../../domain/entities/customer.js";
import type { SortOrder } from "./product-repository.js";

export type CustomerSortField = "name" | "createdAt";

export interface ListCustomersParams {
  page: number;
  limit: number;
  search?: string;
  sort: CustomerSortField;
  order: SortOrder;
}

export interface PagedCustomers {
  rows: Customer[];
  total: number;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  insert(customer: Customer): Promise<void>;
  update(customer: Customer): Promise<void>;
  delete(id: string): Promise<void>;
  list(params: ListCustomersParams): Promise<PagedCustomers>;
}
