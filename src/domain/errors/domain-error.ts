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

/** Missing or invalid credentials/session — maps to HTTP 401. */
export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";

  constructor(message = "Authentication required") {
    super(message);
  }
}

/**
 * Auth cannot run because configuration (OIDC credentials or cookie secret)
 * is absent — maps to HTTP 503. Auth must fail closed, never open.
 */
export class AuthNotConfiguredError extends DomainError {
  readonly code = "AUTH_NOT_CONFIGURED";

  constructor(message = "Authentication is not configured") {
    super(message);
  }
}
