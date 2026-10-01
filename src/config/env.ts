import { existsSync } from "node:fs";
import { z } from "zod";

/** Empty strings count as unset so `.env.example` stays copy-paste safe. */
const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/** Issuer/client credentials form one set — partial auth config is an error. */
const OAUTH_CORE = ["OAUTH_ISSUER", "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET"] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    /** `file:./dev.db` (SQLite) or `postgresql://...` (PostgreSQL). */
    DATABASE_URL: z.string().min(1),
    /** Test-only PostgreSQL target; when set, integration tests cover it. */
    TEST_POSTGRES_URL: z.string().min(1).optional(),
    /** OIDC provider issuer URL — the discovery document derives from it. */
    OAUTH_ISSUER: unsetIfEmpty(z.url()),
    OAUTH_CLIENT_ID: unsetIfEmpty(z.string().min(1)),
    OAUTH_CLIENT_SECRET: unsetIfEmpty(z.string().min(1)),
    /** Expected `aud` claim of the ID token; falls back to the client id. */
    OAUTH_AUDIENCE: unsetIfEmpty(z.string().min(1)),
    /** Registered callback URL; derived from the request when omitted (dev). */
    OAUTH_REDIRECT_URI: unsetIfEmpty(z.url()),
    /** Signs session and login-state cookies (min 32 chars). */
    COOKIE_SECRET: unsetIfEmpty(z.string().min(32)),
  })
  .superRefine((value, ctx) => {
    const provided = OAUTH_CORE.filter((key) => value[key] !== undefined);
    if (provided.length > 0 && provided.length < OAUTH_CORE.length) {
      for (const key of OAUTH_CORE) {
        if (value[key] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `required when ${provided.join(", ")} is set`,
          });
        }
      }
    }
    // Fail-fast enforcement of the remaining production secrets is owned by
    // the hardening phase; until then auth fails closed at runtime (503/401).
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
