import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedApp } from "../helpers/auth.js";
import { buildAuthenticatedApp } from "../helpers/auth.js";

describe("app e2e", () => {
  let context: AuthenticatedApp;

  beforeAll(async () => {
    context = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await context.app.close();
  });

  describe("GET /health", () => {
    it("answers 200 with the service status", async () => {
      const response = await context.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  describe("unknown routes", () => {
    it.each(["/", "/api/v1/nowhere", "/health/deep"])(
      "answers 404 for %s",
      async (url) => {
        const response = await context.inject({ method: "GET", url });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({
          error: { code: "NOT_FOUND", message: "Route not found" },
        });
      },
    );

    it("answers 404 for an unsupported method", async () => {
      const response = await context.inject({ method: "DELETE", url: "/health" });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    });
  });

  describe("malformed requests", () => {
    it("rejects an invalid JSON body", async () => {
      const response = await context.inject({
        method: "POST",
        url: "/api/v1/categories",
        headers: { "content-type": "application/json" },
        payload: "{ nope",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an unsupported content type", async () => {
      const response = await context.inject({
        method: "POST",
        url: "/api/v1/categories",
        headers: { "content-type": "application/xml" },
        payload: "<category/>",
      });

      expect(response.statusCode).toBe(415);
      expect(response.json().error.code).toBe("BAD_REQUEST");
    });
  });

  describe("cross-resource journey", () => {
    it("keeps products consistent when their category is deleted", async () => {
      const suffix = randomUUID().slice(0, 8);

      const category = await context.inject({
        method: "POST",
        url: "/api/v1/categories",
        payload: { name: `Journey ${suffix}` },
      });
      expect(category.statusCode).toBe(201);
      const categoryId = category.json().id;

      const product = await context.inject({
        method: "POST",
        url: "/api/v1/products",
        payload: {
          sku: `JRN-${suffix}`,
          name: `Journey Keyboard ${suffix}`,
          priceCents: 15000,
          categoryId,
        },
      });
      expect(product.statusCode).toBe(201);
      const productId = product.json().id;
      expect(product.json().categoryId).toBe(categoryId);

      const search = await context.inject({
        method: "GET",
        url: `/api/v1/products?search=${encodeURIComponent(`Journey Keyboard ${suffix}`)}`,
      });
      expect(search.statusCode).toBe(200);
      expect(search.json().pagination.total).toBe(1);
      expect(search.json().data[0].id).toBe(productId);

      const deleted = await context.inject({
        method: "DELETE",
        url: `/api/v1/categories/${categoryId}`,
      });
      expect(deleted.statusCode).toBe(204);

      const refetched = await context.inject({
        method: "GET",
        url: `/api/v1/products/${productId}`,
      });
      expect(refetched.statusCode).toBe(200);
      expect(refetched.json().categoryId).toBeNull();

      const gone = await context.inject({
        method: "GET",
        url: `/api/v1/categories/${categoryId}`,
      });
      expect(gone.statusCode).toBe(404);
      expect(gone.json()).toEqual({
        error: { code: "CATEGORY_NOT_FOUND", message: expect.any(String) },
      });
    });

    it("rejects a product pointing at an unknown category", async () => {
      const response = await context.inject({
        method: "POST",
        url: "/api/v1/products",
        payload: {
          sku: `ORPHAN-${randomUUID().slice(0, 8)}`,
          name: "Orphan Product",
          priceCents: 100,
          categoryId: randomUUID(),
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });
});
