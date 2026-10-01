import { fileURLToPath } from "node:url";
import { loadDotEnv, loadEnv } from "../../config/env.js";
import { resolveDialect, sqliteFilename } from "./client.js";
import { PostgresDatabase } from "./postgres.js";
import { SqliteDatabase } from "./sqlite.js";

export function runMigrations(databaseUrl: string): void | Promise<void> {
  const dialect = resolveDialect(databaseUrl);

  if (dialect === "sqlite") {
    const database = new SqliteDatabase(sqliteFilename(databaseUrl));
    try {
      database.migrate();
    } finally {
      database.close();
    }
    return;
  }

  const database = new PostgresDatabase(databaseUrl);
  return database.migrate().finally(() => database.close());
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
