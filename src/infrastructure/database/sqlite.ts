import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

/**
 * Serializes database access within this process.
 *
 * better-sqlite3 is synchronous and drizzle's SQLite transactions require a
 * *synchronous* callback (the driver rejects promises: "Transaction function
 * cannot return a promise"). Our transactions run async application code, so
 * transactions are started/committed manually. While such a transaction is
 * open, any other query issued on the same connection would silently join it,
 * so every operation must pass through this queue.
 */
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

/**
 * Runs a unit of database work serialized with every other unit (including
 * transactions). The callback must be async so the query executes while the
 * lock is held.
 */
export type GuardFn = <T>(fn: () => Promise<T>) => Promise<T>;

export interface SqliteContext {
  readonly db: BetterSQLite3Database;
  /**
   * Must be used for every query. Inside `transaction()` the guard is a
   * passthrough because the caller already holds the mutex.
   */
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

  /** Context for non-transactional access (serialized with transactions). */
  get context(): SqliteContext {
    return {
      db: this.db,
      guard: <T>(fn: () => Promise<T>): Promise<T> => this.mutex.run(fn),
    };
  }

  /**
   * Runs `fn` inside a transaction with IMMEDIATE locking. Rolls back on any
   * error. The context passed to `fn` must be used for all queries; using the
   * steady-state `context` inside a transaction would deadlock on the mutex.
   */
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
        } catch {
          // transaction already aborted by the database
        }
        throw error;
      }
    });
  }

  close(): void {
    this.client.close();
  }
}
