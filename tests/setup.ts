import { loadDotEnv, loadEnv } from "../src/config/env.js";

loadDotEnv();
const env = loadEnv();

if (process.env.CI && !env.TEST_POSTGRES_URL) {
  throw new Error(
    "TEST_POSTGRES_URL is required in CI: PostgreSQL integration tests must not be skipped",
  );
}
