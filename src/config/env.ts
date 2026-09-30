import { existsSync } from "node:fs";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  /** `file:./dev.db` (SQLite) or `postgresql://...` (PostgreSQL). */
  DATABASE_URL: z.string().min(1),
  /** Test-only PostgreSQL target; when set, integration tests cover it. */
  TEST_POSTGRES_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Loads `.env` (if present) into `process.env` using Node's built-in parser.
 * Real environment variables take precedence over values in the file.
 */
export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/**
 * Validates the environment. Throws with a readable message when invalid so
 * the process fails fast at startup instead of misbehaving later.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
