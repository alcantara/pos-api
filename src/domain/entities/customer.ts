import { DomainError } from "../errors/domain-error.js";

/**
 * A person or company that buys products. `email` is optional but unique;
 * timestamps are epoch milliseconds (UTC).
 */
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
