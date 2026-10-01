import { z } from "zod";

export interface SecurityConfig {
  rateLimitMax: number;
  rateLimitWindowMs: number;
  corsOrigins: string[] | null;
  csrfProtection: boolean;
}

const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const schema = z.object({
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(3_600_000)
    .default(60_000),
  CORS_ORIGINS: unsetIfEmpty(z.string().min(1)),
  CSRF_PROTECTION: z
    .enum(["true", "false", "strict"])
    .default("strict")
    .transform((value) => value === "strict" || value === "true"),
});

export function loadSecurityConfig(env: NodeJS.ProcessEnv): SecurityConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid security configuration — ${issues}`);
  }

  return {
    rateLimitMax: parsed.data.RATE_LIMIT_MAX,
    rateLimitWindowMs: parsed.data.RATE_LIMIT_WINDOW_MS,
    corsOrigins: parsed.data.CORS_ORIGINS
      ? parsed.data.CORS_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
      : null,
    csrfProtection: parsed.data.CSRF_PROTECTION,
  };
}
