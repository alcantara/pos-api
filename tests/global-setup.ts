import { loadDotEnv, loadEnv } from "../src/config/env.js";
import { createDependencies } from "../src/infrastructure/dependencies.js";

/**
 * Applies migrations to every shared test target exactly once, before Vitest
 * fans out into parallel workers.
 *
 * Each integration test file calls `createDependencies`, which migrates on
 * construction. That is harmless for in-memory SQLite (every file gets its own
 * database) but racy for PostgreSQL: several files migrating a fresh database
 * concurrently issue the same `CREATE TABLE` at the same time, and the loser
 * fails with `already exists`. Running the migration here first makes the
 * per-file calls no-ops, so the suite is green on the very first run against a
 * clean database — locally and in CI.
 */
export async function setup(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();

  const targets: string[] = ["file::memory:"];
  if (env.TEST_POSTGRES_URL) {
    targets.push(env.TEST_POSTGRES_URL);
  }

  for (const databaseUrl of targets) {
    const { close } = await createDependencies(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: databaseUrl,
      }),
    );
    await close();
  }
}
