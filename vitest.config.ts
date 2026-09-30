import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests never touch the developer's real database: SQLite runs in memory
    // (or a temp file), PostgreSQL comes from TEST_POSTGRES_URL.
    env: {
      DATABASE_URL: "file::memory:",
    },
    setupFiles: ["tests/setup.ts"],
  },
});
