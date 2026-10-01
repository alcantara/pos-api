import type { PgDatabase } from "drizzle-orm/pg-core";
import { migrate as applyMigrations } from "drizzle-orm/postgres-js/migrator";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(
  new URL("../../../drizzle/postgres", import.meta.url),
);

export type PgHandle = PgDatabase<PostgresJsQueryResultHKT, Record<string, never>>;

export interface PgContext {
  readonly db: PgHandle;
}

export class PostgresDatabase {
  readonly dialect = "postgres" as const;
  readonly db: PostgresJsDatabase;
  private readonly client: postgres.Sql;

  constructor(url: string) {
    this.client = postgres(url, { max: 10, onnotice: () => {} });
    this.db = drizzle(this.client);
  }

  get context(): PgContext {
    return { db: this.db };
  }

  async transaction<T>(fn: (ctx: PgContext) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn({ db: tx }));
  }

  migrate(): Promise<void> {
    return applyMigrations(this.db, { migrationsFolder });
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
