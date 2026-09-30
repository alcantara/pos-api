import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Query handle accepted by repositories. `PgTransaction` extends
 * `PgDatabase`, so the same repository classes work with the root handle
 * (non-transactional use) and with a transaction handle.
 */
export type PgHandle = PgDatabase<PostgresJsQueryResultHKT, Record<string, never>>;

export interface PgContext {
  readonly db: PgHandle;
}

export class PostgresDatabase {
  readonly dialect = "postgres" as const;
  readonly db: PostgresJsDatabase;
  private readonly client: postgres.Sql;

  constructor(url: string) {
    this.client = postgres(url, { max: 10 });
    this.db = drizzle(this.client);
  }

  get context(): PgContext {
    return { db: this.db };
  }

  /** Runs `fn` inside a database transaction (native async support). */
  async transaction<T>(fn: (ctx: PgContext) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn({ db: tx }));
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
