import { existsSync } from "node:fs";
import { z } from "zod";

const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const OAUTH_CORE = ["OAUTH_ISSUER", "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET"] as const;

const CSV_PATTERN = /^[^,\s]+(\s*,\s*[^,\s]+)*$/;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().min(1),
    TEST_POSTGRES_URL: z.string().min(1).optional(),
    OAUTH_ISSUER: unsetIfEmpty(z.url()),
    OAUTH_CLIENT_ID: unsetIfEmpty(z.string().min(1)),
    OAUTH_CLIENT_SECRET: unsetIfEmpty(z.string().min(1)),
    OAUTH_AUDIENCE: unsetIfEmpty(z.string().min(1)),
    OAUTH_REDIRECT_URI: unsetIfEmpty(z.url()),
    COOKIE_SECRET: unsetIfEmpty(z.string().min(32)),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(120),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(3_600_000)
      .default(60_000),
    CORS_ORIGINS: unsetIfEmpty(
      z.string().refine((value) => CSV_PATTERN.test(value.trim()), {
        message: "must be a comma-separated list of origins",
      }),
    ),
    CSRF_PROTECTION: z
      .enum(["strict", "true", "false"])
      .default("strict")
      .transform((value) => value !== "false"),
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
  });

export type Env = z.infer<typeof envSchema>;

export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

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
