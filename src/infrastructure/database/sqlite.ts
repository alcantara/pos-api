import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate as applyMigrations } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(
  new URL("../../../drizzle/sqlite", import.meta.url),
);

class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export type GuardFn = <T>(fn: () => Promise<T>) => Promise<T>;

export interface SqliteContext {
  readonly db: BetterSQLite3Database;
  readonly guard: GuardFn;
}

const passthroughGuard: GuardFn = async (fn) => fn();

export class SqliteDatabase {
  readonly dialect = "sqlite" as const;
  readonly db: BetterSQLite3Database;
  private readonly client: Database.Database;
  private readonly mutex = new Mutex();

  constructor(filename: string) {
    this.client = new Database(filename);
    this.client.pragma("foreign_keys = ON");
    this.client.pragma("busy_timeout = 5000");
    if (filename !== ":memory:") {
      this.client.pragma("journal_mode = WAL");
    }
    this.db = drizzle(this.client);
  }

  get context(): SqliteContext {
    return {
      db: this.db,
      guard: <T>(fn: () => Promise<T>): Promise<T> => this.mutex.run(fn),
    };
  }

  async transaction<T>(fn: (ctx: SqliteContext) => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      this.client.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn({ db: this.db, guard: passthroughGuard });
        this.client.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          this.client.exec("ROLLBACK");
        } catch {}
        throw error;
      }
    });
  }

  migrate(): void {
    applyMigrations(this.db, { migrationsFolder });
  }

  close(): void {
    this.client.close();
  }
}
