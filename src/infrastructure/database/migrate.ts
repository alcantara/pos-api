import { fileURLToPath } from "node:url";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { loadDotEnv, loadEnv } from "../../config/env.js";
import { resolveDialect, sqliteFilename } from "./client.js";
import { PostgresDatabase } from "./postgres.js";
import { SqliteDatabase } from "./sqlite.js";

const sqliteMigrationsFolder = fileURLToPath(
  new URL("../../../drizzle/sqlite", import.meta.url),
);
const postgresMigrationsFolder = fileURLToPath(
  new URL("../../../drizzle/postgres", import.meta.url),
);

/** Applies pending migrations for the given `DATABASE_URL`. Idempotent. */
export function runMigrations(databaseUrl: string): void | Promise<void> {
  const dialect = resolveDialect(databaseUrl);

  if (dialect === "sqlite") {
    const database = new SqliteDatabase(sqliteFilename(databaseUrl));
    try {
      migrateSqlite(database.db, { migrationsFolder: sqliteMigrationsFolder });
    } finally {
      database.close();
    }
    return;
  }

  const database = new PostgresDatabase(databaseUrl);
  return migratePostgres(database.db, {
    migrationsFolder: postgresMigrationsFolder,
  }).finally(() => database.close());
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  await runMigrations(env.DATABASE_URL);
  console.log(`migrations applied (${resolveDialect(env.DATABASE_URL)})`);
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
