import { defineConfig } from "drizzle-kit";

/**
 * Generates PostgreSQL migrations into `drizzle/postgres`. Apply them with
 * `pnpm db:migrate` (drizzle-kit push/studio are intentionally unused —
 * migrations are the source of truth).
 */
export default defineConfig({
  schema: "./src/infrastructure/database/schema/postgres.ts",
  out: "./drizzle/postgres",
  dialect: "postgresql",
});
