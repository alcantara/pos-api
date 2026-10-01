import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infrastructure/database/schema/sqlite.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
});
