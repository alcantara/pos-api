import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ProductNotFoundError } from "../../domain/entities/product.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { registerErrorHandling } from "./errors.js";

class CodedError extends DomainError {
  constructor(readonly code: string) {
    super(`failed with ${code}`);
  }
}

describe("HTTP error handling", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    registerErrorHandling(app);

    app.get<{ Querystring: { code: string } }>("/throw/code", (request) => {
      throw new CodedError(request.query.code);
    });
    app.get("/throw/product-not-found", () => {
      throw new ProductNotFoundError("p-1");
    });
    app.get("/throw/plain", () => {
      throw new Error("connection string with password");
    });
    app.get("/throw/status-400", () => {
      throw Object.assign(new Error("malformed body"), { statusCode: 400 });
    });
    app.get("/throw/status-413", () => {
      throw Object.assign(new Error("payload too large"), { statusCode: 413 });
    });
    app.get("/throw/zod-field", () => {
      z.object({ name: z.string() }).parse({});
    });
    app.get("/throw/zod-root", () => {
      z.string().parse(42);
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ["VALIDATION_ERROR", 400],
    ["BAD_REQUEST", 400],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["PRODUCT_NOT_FOUND", 404],
    ["CATEGORY_NOT_FOUND", 404],
    ["CUSTOMER_NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["INSUFFICIENT_STOCK", 409],
    ["RATE_LIMITED", 429],
    ["AUTH_NOT_CONFIGURED", 503],
  ] as const)("maps domain code %s to HTTP %i", async (code, status) => {
    const response = await app.inject({
      method: "GET",
      url: `/throw/code?code=${code}`,
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({
      error: { code, message: `failed with ${code}` },
    });
  });

  it("keeps the concrete domain error code and message", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/throw/product-not-found",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "PRODUCT_NOT_FOUND", message: "Product p-1 not found" },
    });
  });

  it("sanitises unmapped domain codes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/throw/code?code=SOMETHING_NEW",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  it("sanitises unexpected errors without leaking the message", async () => {
    const response = await app.inject({ method: "GET", url: "/throw/plain" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(response.body).not.toContain("password");
  });

  it("maps Fastify 400 errors to VALIDATION_ERROR", async () => {
    const response = await app.inject({ method: "GET", url: "/throw/status-400" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "malformed body" },
    });
  });

  it("maps other client errors to BAD_REQUEST keeping the status", async () => {
    const response = await app.inject({ method: "GET", url: "/throw/status-413" });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      error: { code: "BAD_REQUEST", message: "payload too large" },
    });
  });

  it("reports Zod failures with per-field details", async () => {
    const response = await app.inject({ method: "GET", url: "/throw/zod-field" });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Request validation failed");
    expect(body.error.details).toEqual([{ path: "name", message: expect.any(String) }]);
  });

  it("labels failures without a path as (root)", async () => {
    const response = await app.inject({ method: "GET", url: "/throw/zod-root" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([
      { path: "(root)", message: expect.any(String) },
    ]);
  });

  it("answers unknown routes with the NOT_FOUND envelope", async () => {
    for (const url of ["/", "/api/v1/nowhere"]) {
      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "NOT_FOUND", message: "Route not found" },
      });
    }
  });
});
