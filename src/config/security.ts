import type { Env } from "./env.js";

export interface SecurityConfig {
  rateLimitMax: number;
  rateLimitWindowMs: number;
  corsOrigins: string[] | null;
  csrfProtection: boolean;
  hsts: boolean;
}

const CSV_PATTERN = /^[^,\s]+(\s*,\s*[^,\s]+)*$/;

export function toSecurityConfig(env: Env): SecurityConfig {
  return {
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
      : null,
    csrfProtection: env.CSRF_PROTECTION,
    hsts: env.NODE_ENV === "production",
  };
}

export function validateCorsOrigins(value: string): boolean {
  return CSV_PATTERN.test(value.trim());
}
