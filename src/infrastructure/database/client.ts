export type Dialect = "sqlite" | "postgres";

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

export function sqliteFilename(databaseUrl: string): string {
  return databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
}
