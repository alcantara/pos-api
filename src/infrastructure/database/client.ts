export type Dialect = "sqlite" | "postgres";

/**
 * Selects the database from `DATABASE_URL`:
 * - `file:./dev.db` or a bare path → SQLite
 * - `postgresql://...` / `postgres://...` → PostgreSQL
 */
export function resolveDialect(databaseUrl: string): Dialect {
  if (
    databaseUrl.startsWith("postgres://") ||
    databaseUrl.startsWith("postgresql://")
  ) {
    return "postgres";
  }
  if (databaseUrl.startsWith("file:") || !databaseUrl.includes("://")) {
    return "sqlite";
  }
  throw new Error(
    `Unsupported DATABASE_URL: expected a file path or a postgres:// URL`,
  );
}

/** Extracts the filesystem path from a `DATABASE_URL` (e.g. `file:./dev.db`). */
export function sqliteFilename(databaseUrl: string): string {
  return databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
}
