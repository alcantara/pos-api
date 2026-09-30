import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveDialect, sqliteFilename } from "./client.js";
import { PostgresDatabase } from "./postgres.js";

/**
 * Drops and recreates the public schema (PostgreSQL) or deletes the database
 * file (SQLite). Refuses to run against databases whose name does not look
 * like a dev/test database.
 */
export async function resetDatabase(databaseUrl: string): Promise<void> {
  const dialect = resolveDialect(databaseUrl);

  if (dialect === "sqlite") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("refusing to reset the database in production");
    }
    const filename = sqliteFilename(databaseUrl);
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(`${filename}${suffix}`);
      } catch {
        // file may not exist
      }
    }
    return;
  }

  const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!/dev|test/i.test(dbName)) {
    throw new Error(
      `refusing to reset database "${dbName}": name must contain "dev" or "test"`,
    );
  }

  const database = new PostgresDatabase(databaseUrl);
  try {
    // Two statements per schema: the extended query protocol does not allow
    // batching. The `drizzle` schema holds migration bookkeeping and must go
    // too, otherwise migrate would consider old migrations applied.
    await database.db.execute("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await database.db.execute("DROP SCHEMA public CASCADE");
    await database.db.execute("CREATE SCHEMA public");
  } finally {
    await database.close();
  }
}

async function main(): Promise<void> {
  const { loadDotEnv, loadEnv } = await import("../../config/env.js");
  loadDotEnv();
  const env = loadEnv();
  await resetDatabase(env.DATABASE_URL);
  console.log(`database reset (${resolveDialect(env.DATABASE_URL)})`);
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
