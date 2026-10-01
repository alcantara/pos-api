import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DomainError } from "../../domain/errors/domain-error.js";

/**
 * Consistent error envelope: `{ "error": { "code", "message" } }`
 * (plus `details` for validation failures — input diagnostics only).
 */
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
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  RATE_LIMITED: 429,
};

/** Fastify errors carry a `statusCode`; anything else is treated as a 500. */
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
        // Unknown domain codes must not leak; log and sanitize.
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

    // Fastify-originated client errors (malformed JSON, oversized body, …).
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
