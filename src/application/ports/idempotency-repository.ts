import type { IdempotencyRecord } from "../../domain/entities/idempotency.js";

export interface IdempotencyScope {
  userId: string;
  key: string;
}

export type IdempotencyClaim = IdempotencyRecord;

/**
 * Idempotency keys are scoped per user, so two users may use the same key
 * without colliding and no user can ever be handed another user's resource.
 */
export interface IdempotencyStore {
  find(scope: IdempotencyScope): Promise<IdempotencyRecord | null>;
}

/**
 * Claiming happens inside the same transaction as the write it protects. It
 * either succeeds or throws `IdempotencyKeyTakenError`, which aborts that
 * transaction — the unique index is the arbiter, so two concurrent requests
 * carrying the same key can never both commit.
 */
export interface IdempotencyWriteContext {
  claimIdempotency(claim: IdempotencyClaim): Promise<void>;
}
