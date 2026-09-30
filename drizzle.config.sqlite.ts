import { defineConfig } from "drizzle-kit";

/**
 * Generates SQLite migrations into `drizzle/sqlite`. Apply them with
 * `pnpm db:migrate` (drizzle-kit push/studio are intentionally unused —
 * migrations are the source of truth).
 */
export default defineConfig({
  schema: "./src/infrastructure/database/schema/sqlite.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
});
