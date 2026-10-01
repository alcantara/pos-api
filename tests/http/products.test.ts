import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("products HTTP API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function createProduct(payload: Record<string, unknown>) {
    return app.inject({ method: "POST", url: "/api/v1/products", payload });
  }

  describe("POST /api/v1/products", () => {
    it("creates a product with 201, Location and HATEOAS links", async () => {
      const response = await createProduct({
        sku: "KB-001",
        name: "Keyboard",
        priceCents: 19990,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(UUID_PATTERN);
      expect(body.sku).toBe("KB-001");
      expect(body.name).toBe("Keyboard");
      expect(body.priceCents).toBe(19990);
      expect(body.stockQuantity).toBe(0);
      expect(body.description).toBeNull();
      expect(body.categoryId).toBeNull();
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(response.headers.location).toBe(`/api/v1/products/${body.id}`);
      expect(body._links).toEqual({
        self: { href: `/api/v1/products/${body.id}` },
        update: { href: `/api/v1/products/${body.id}`, method: "PATCH" },
        delete: { href: `/api/v1/products/${body.id}`, method: "DELETE" },
      });
    });

    it("rejects a duplicate SKU with 409 CONFLICT", async () => {
      await createProduct({ sku: "DUP-001", name: "First", priceCents: 100 });
      const response = await createProduct({
        sku: "DUP-001",
        name: "Second",
        priceCents: 200,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: "CONFLICT",
          message: expect.stringContaining("DUP-001"),
        },
      });
    });

    it("rejects invalid fields with 400 VALIDATION_ERROR and details", async () => {
      const response = await createProduct({
        sku: "",
        name: "  ",
        priceCents: -5,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Request validation failed");
      expect(Array.isArray(body.error.details)).toBe(true);
      expect(body.error.details.length).toBeGreaterThan(0);
    });

    it("rejects unknown fields with 400 (strict schemas)", async () => {
      const response = await createProduct({
        sku: "X-1",
        name: "Y",
        priceCents: 1,
        price: 999,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects malformed JSON with 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/products",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/products/:id", () => {
    it("returns the product", async () => {
      const created = await createProduct({
        sku: `GET-${randomUUID()}`,
        name: "Mouse",
        priceCents: 5990,
        description: "Wireless mouse",
      });
      const { id } = created.json();

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/products/${id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(id);
      expect(body.description).toBe("Wireless mouse");
      expect(body._links.self.href).toBe(`/api/v1/products/${id}`);
    });

    it("returns 404 PRODUCT_NOT_FOUND for an unknown id", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/products/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "PRODUCT_NOT_FOUND", message: expect.any(String) },
      });
    });

    it("returns 400 for a malformed id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/products/not-a-uuid",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/products", () => {
    const token = `L${randomUUID().slice(0, 8)}`;
    const seed = async (name: string, priceCents: number) =>
      createProduct({ sku: `${token}-${name}`, name, priceCents });

    it("returns pagination envelope with prev/next links", async () => {
      await seed(`${token} low`, 100);
      await seed(`${token} mid`, 200);
      await seed(`${token} high`, 300);

      const first = await app.inject({
        method: "GET",
        url: `/api/v1/products?search=${token}&limit=2&page=1&sort=price&order=asc`,
      });

      expect(first.statusCode).toBe(200);
      const body = first.json();
      expect(body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(body.data).toHaveLength(2);
      expect(body.data[0].priceCents).toBe(100);
      expect(body.data[1].priceCents).toBe(200);
      expect(body._links.prev).toBeUndefined();
      expect(body._links.next.href).toContain("page=2");

      const second = await app.inject({
        method: "GET",
        url: `/api/v1/products?search=${token}&limit=2&page=2&sort=price&order=asc`,
      });
      const secondBody = second.json();
      expect(secondBody.data).toHaveLength(1);
      expect(secondBody.data[0].priceCents).toBe(300);
      expect(secondBody._links.prev.href).toContain("page=1");
      expect(secondBody._links.next).toBeUndefined();
    });

    it("matches search case-insensitively", async () => {
      const lower = await app.inject({
        method: "GET",
        url: `/api/v1/products?search=${token.toLowerCase()}`,
      });
      const upper = await app.inject({
        method: "GET",
        url: `/api/v1/products?search=${token.toUpperCase()}`,
      });

      expect(lower.statusCode).toBe(200);
      expect(lower.json().pagination.total).toBe(3);
      expect(upper.json().pagination.total).toBe(3);
    });

    it("treats LIKE wildcards in search as literal text", async () => {
      await createProduct({ sku: "PCT-1", name: "Cable 50% off", priceCents: 10 });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/products?search=" + encodeURIComponent("50%"),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.pagination.total).toBe(1);
      expect(body.data[0].name).toBe("Cable 50% off");
    });

    it("rejects limit above 100 with 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/products?limit=101",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a sort field outside the allowlist with 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/products?sort=description",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/products/:id", () => {
    it("applies partial updates", async () => {
      const created = await createProduct({
        sku: `PATCH-${randomUUID()}`,
        name: "Old name",
        priceCents: 1000,
      });
      const { id } = created.json();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/products/${id}`,
        payload: { name: "New name" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe("New name");
      expect(body.priceCents).toBe(1000);
      expect(body.sku).toBe(created.json().sku);
    });

    it("rejects an empty body with 400", async () => {
      const created = await createProduct({
        sku: `EMPTY-${randomUUID()}`,
        name: "x",
        priceCents: 1,
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/products/${created.json().id}`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a missing product", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/products/${randomUUID()}`,
        payload: { name: "x" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("PRODUCT_NOT_FOUND");
    });
  });

  describe("DELETE /api/v1/products/:id", () => {
    it("deletes with 204 and the product is gone", async () => {
      const created = await createProduct({
        sku: `DEL-${randomUUID()}`,
        name: "Disposable",
        priceCents: 1,
      });
      const { id } = created.json();

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/v1/products/${id}`,
      });
      expect(deleted.statusCode).toBe(204);
      expect(deleted.body).toBe("");

      const gone = await app.inject({
        method: "GET",
        url: `/api/v1/products/${id}`,
      });
      expect(gone.statusCode).toBe(404);
    });

    it("returns 404 when deleting a missing product", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/products/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("PRODUCT_NOT_FOUND");
    });
  });

  describe("category references", () => {
    it("creates a product under an existing category", async () => {
      const category = await app.inject({
        method: "POST",
        url: "/api/v1/categories",
        payload: { name: `Cat ${randomUUID()}` },
      });
      const categoryId = category.json().id;

      const response = await createProduct({
        sku: `REF-${randomUUID()}`,
        name: "Categorized product",
        priceCents: 500,
        categoryId,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().categoryId).toBe(categoryId);
    });

    it("rejects create with an unknown categoryId (400)", async () => {
      const response = await createProduct({
        sku: `REF-${randomUUID()}`,
        name: "Bad reference",
        priceCents: 500,
        categoryId: randomUUID(),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("category");
    });

    it("assigns and clears categoryId via PATCH", async () => {
      const category = await app.inject({
        method: "POST",
        url: "/api/v1/categories",
        payload: { name: `Cat ${randomUUID()}` },
      });
      const categoryId = category.json().id;

      const created = await createProduct({
        sku: `REF-${randomUUID()}`,
        name: "Patchable",
        priceCents: 500,
      });
      const { id } = created.json();

      const assigned = await app.inject({
        method: "PATCH",
        url: `/api/v1/products/${id}`,
        payload: { categoryId },
      });
      expect(assigned.statusCode).toBe(200);
      expect(assigned.json().categoryId).toBe(categoryId);

      const cleared = await app.inject({
        method: "PATCH",
        url: `/api/v1/products/${id}`,
        payload: { categoryId: null },
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().categoryId).toBeNull();
    });
  });
});
