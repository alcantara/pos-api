import { DomainError } from "../errors/domain-error.js";

export interface IdempotencyRecord {
  key: string;
  userId: string;
  requestHash: string;
  resourceId: string;
  createdAt: number;
}

export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

/**
 * The same key was replayed with a different payload. Reusing a key for another
 * request would silently return the wrong resource, so it is rejected.
 */
export class IdempotencyKeyConflictError extends DomainError {
  readonly code = "CONFLICT";

  constructor() {
    super("This Idempotency-Key was already used with a different request body");
  }
}

/**
 * Raised by the repository when the key is already owned by another committed
 * request. It aborts the enclosing transaction, so callers must resolve the
 * existing resource outside of it.
 */
export class IdempotencyKeyTakenError extends DomainError {
  readonly code = "IDEMPOTENCY_KEY_TAKEN";

  constructor(readonly key: string) {
    super(`Idempotency key "${key}" is already in use`);
  }
}

/**
 * Internal signal: the key was already claimed by a committed request. The
 * transaction cannot continue (the unique index aborted it), so the caller
 * resolves the existing resource outside the transaction.
 */
export class IdempotentReplayError extends DomainError {
  readonly code = "IDEMPOTENT_REPLAY";
  readonly resourceId: string;

  constructor(resourceId: string) {
    super(`Request already processed as ${resourceId}`);
    this.resourceId = resourceId;
  }
}
