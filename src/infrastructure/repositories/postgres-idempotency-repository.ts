import { and, eq } from "drizzle-orm";
import type {
  IdempotencyClaim,
  IdempotencyScope,
  IdempotencyStore,
  IdempotencyWriteContext,
} from "../../application/ports/idempotency-repository.js";
import {
  IdempotencyKeyTakenError,
  type IdempotencyRecord,
} from "../../domain/entities/idempotency.js";
import type { PgContext } from "../database/postgres.js";
import { idempotencyRecords } from "../database/schema/postgres.js";
import { isUniqueViolation } from "./db-errors.js";

export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly ctx: PgContext) {}

  async find(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    const [row] = await this.ctx.db
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, scope.userId),
          eq(idempotencyRecords.key, scope.key),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

/**
 * On PostgreSQL a read-then-insert would race under READ COMMITTED: two
 * transactions can both see no row. The insert is therefore the arbiter — the
 * unique index on (user_id, key) makes the loser block until the winner commits
 * and then fail, which aborts its transaction. The caller resolves the winning
 * resource outside the transaction.
 */
export class PostgresIdempotencyWriteContext implements IdempotencyWriteContext {
  constructor(private readonly ctx: PgContext) {}

  async claimIdempotency(record: IdempotencyClaim): Promise<void> {
    try {
      await this.ctx.db.insert(idempotencyRecords).values(record);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdempotencyKeyTakenError(record.key);
      }
      throw error;
    }
  }
}
