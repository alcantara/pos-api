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
import { idempotencyRecords } from "../database/schema/sqlite.js";
import type { SqliteContext } from "../database/sqlite.js";

export class SqliteIdempotencyStore implements IdempotencyStore {
  constructor(private readonly ctx: SqliteContext) {}

  async find(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
    return this.ctx.guard(async () => this.select(scope));
  }

  async select(scope: IdempotencyScope): Promise<IdempotencyRecord | null> {
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
 * SQLite writes are serialized (`BEGIN IMMEDIATE` plus an in-process mutex), so
 * a read-then-insert inside the transaction is already exclusive: no other
 * writer can slip between the two statements.
 */
export class SqliteIdempotencyWriteContext implements IdempotencyWriteContext {
  private readonly store: SqliteIdempotencyStore;

  constructor(private readonly ctx: SqliteContext) {
    this.store = new SqliteIdempotencyStore(ctx);
  }

  async claimIdempotency(record: IdempotencyClaim): Promise<void> {
    await this.ctx.guard(async () => {
      const existing = await this.store.select({
        userId: record.userId,
        key: record.key,
      });
      if (existing) {
        throw new IdempotencyKeyTakenError(record.key);
      }
      await this.ctx.db.insert(idempotencyRecords).values(record);
    });
  }
}
