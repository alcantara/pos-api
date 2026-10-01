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

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";

  constructor(message = "Validation failed") {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";

  constructor(message = "Authentication required") {
    super(message);
  }
}

export class AuthNotConfiguredError extends DomainError {
  readonly code = "AUTH_NOT_CONFIGURED";

  constructor(message = "Authentication is not configured") {
    super(message);
  }
}
