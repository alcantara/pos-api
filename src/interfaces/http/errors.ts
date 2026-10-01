import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DomainError } from "../../domain/errors/domain-error.js";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export type RateLimiter = (key: string) => RateLimitDecision;

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (key) => {
    const now = Date.now();
    const current = hits.get(key);
    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return {
        allowed: true,
        remaining: max - 1,
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      };
    }

    current.count += 1;
    if (current.count > max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: max - current.count,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  };
}

export interface RateLimitOptions {
  limiter: RateLimiter;
  max: number;
  skip: (request: { url: string; method: string }) => boolean;
}

export function registerRateLimit(
  app: FastifyInstance,
  options: RateLimitOptions,
): void {
  const { limiter, max, skip } = options;

  app.addHook("onRequest", async (request, reply) => {
    if (skip(request)) return;

    const decision = limiter(request.ip);
    reply.header("x-ratelimit-limit", String(max));
    reply.header("x-ratelimit-remaining", String(Math.max(0, decision.remaining)));
    reply.header("x-ratelimit-reset", String(Math.ceil(decision.retryAfterSeconds)));

    if (decision.allowed) return;

    reply.header("retry-after", String(decision.retryAfterSeconds));
    await reply
      .code(429)
      .send({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
  });
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PRODUCT_NOT_FOUND: 404,
  CATEGORY_NOT_FOUND: 404,
  CUSTOMER_NOT_FOUND: 404,
  SALE_NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  RATE_LIMITED: 429,
  AUTH_NOT_CONFIGURED: 503,
};

function extractStatusCode(error: unknown): number {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const envelope: ErrorEnvelope = {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join(".") || "(root)",
            message: issue.message,
          })),
        },
      };
      return reply.code(400).send(envelope);
    }

    if (error instanceof DomainError) {
      const status = STATUS_BY_CODE[error.code];
      if (status === undefined) {
        request.log.error({ code: error.code }, "unmapped domain error code");
        return reply.code(500).send({
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        });
      }
      return reply
        .code(status)
        .send({ error: { code: error.code, message: error.message } });
    }

    const statusCode = extractStatusCode(error);

    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return reply
        .code(500)
        .send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }

    return reply.code(statusCode).send({
      error: {
        code: statusCode === 400 ? "VALIDATION_ERROR" : "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Request failed",
      },
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } }),
  );
}
