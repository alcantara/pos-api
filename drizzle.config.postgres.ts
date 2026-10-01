import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infrastructure/database/schema/postgres.ts",
  out: "./drizzle/postgres",
  dialect: "postgresql",
});
