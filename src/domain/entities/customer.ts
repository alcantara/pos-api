import { DomainError } from "../errors/domain-error.js";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: number;
  updatedAt: number;
}

export class CustomerNotFoundError extends DomainError {
  readonly code = "CUSTOMER_NOT_FOUND";

  constructor(id?: string) {
    super(id ? `Customer ${id} not found` : "Customer not found");
  }
}
