/**
 * Base class for business-rule violations. The HTTP layer maps `code` to an
 * error envelope and status code; unknown codes become a sanitized 500.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";

  constructor(message = "Resource not found") {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT";

  constructor(message: string) {
    super(message);
  }
}

/**
 * Input that passes schema validation but breaks a business rule — e.g. a
 * foreign key pointing at a row that does not exist.
 */
export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";

  constructor(message = "Validation failed") {
    super(message);
  }
}
