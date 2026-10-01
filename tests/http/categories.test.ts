import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("categories HTTP API", () => {
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

  async function createCategory(name: string) {
    return app.inject({
      method: "POST",
      url: "/api/v1/categories",
      payload: { name },
    });
  }

  describe("POST /api/v1/categories", () => {
    it("creates a category with 201, Location and HATEOAS links", async () => {
      const response = await createCategory("Keyboards");

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(UUID_PATTERN);
      expect(body.name).toBe("Keyboards");
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(response.headers.location).toBe(`/api/v1/categories/${body.id}`);
      expect(body._links).toEqual({
        self: { href: `/api/v1/categories/${body.id}` },
        update: { href: `/api/v1/categories/${body.id}`, method: "PATCH" },
        delete: { href: `/api/v1/categories/${body.id}`, method: "DELETE" },
      });
    });

    it("rejects a duplicate name with 409 CONFLICT", async () => {
      await createCategory("Mice");
      const response = await createCategory("Mice");

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: { code: "CONFLICT", message: expect.stringContaining("Mice") },
      });
    });

    it("rejects an empty name with 400 VALIDATION_ERROR", async () => {
      const response = await createCategory("   ");

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(body.error.details)).toBe(true);
    });

    it("rejects unknown fields with 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/categories",
        payload: { name: "X", description: "not allowed" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/categories/:id", () => {
    it("returns the category", async () => {
      const created = await createCategory("Cables");
      const { id } = created.json();

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/categories/${id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(id);
      expect(body._links.self.href).toBe(`/api/v1/categories/${id}`);
    });

    it("returns 404 CATEGORY_NOT_FOUND for an unknown id", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/categories/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "CATEGORY_NOT_FOUND", message: expect.any(String) },
      });
    });

    it("returns 400 for a malformed id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/categories/not-a-uuid",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/categories", () => {
    const token = `K${randomUUID().slice(0, 8)}`;

    it("returns pagination envelope with prev/next links", async () => {
      await createCategory(`${token} gamma`);
      await createCategory(`${token} alpha`);
      await createCategory(`${token} beta`);

      const first = await app.inject({
        method: "GET",
        url: `/api/v1/categories?search=${token}&limit=2&page=1&sort=name&order=asc`,
      });

      expect(first.statusCode).toBe(200);
      const body = first.json<{
        data: Array<{ name: string }>;
        pagination: Record<string, number>;
        _links: { prev?: unknown; next: { href: string } };
      }>();
      expect(body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(body.data.map((row) => row.name)).toEqual([
        `${token} alpha`,
        `${token} beta`,
      ]);
      expect(body._links.prev).toBeUndefined();
      expect(body._links.next.href).toContain("page=2");

      const second = await app.inject({
        method: "GET",
        url: `/api/v1/categories?search=${token}&limit=2&page=2&sort=name&order=asc`,
      });
      const secondBody = second.json();
      expect(secondBody.data).toHaveLength(1);
      expect(secondBody._links.prev.href).toContain("page=1");
      expect(secondBody._links.next).toBeUndefined();
    });

    it("rejects limit above 100 with 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/categories?limit=101",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a sort field outside the allowlist with 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/categories?sort=id",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/categories/:id", () => {
    it("applies partial updates", async () => {
      const created = await createCategory("Old category name");
      const { id } = created.json();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/categories/${id}`,
        payload: { name: "New category name" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe("New category name");
    });

    it("rejects an empty body with 400", async () => {
      const created = await createCategory("Empty patch target");

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/categories/${created.json().id}`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a missing category", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/categories/${randomUUID()}`,
        payload: { name: "x" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CATEGORY_NOT_FOUND");
    });
  });

  describe("DELETE /api/v1/categories/:id", () => {
    it("deletes with 204 and the category is gone", async () => {
      const created = await createCategory("Disposable category");
      const { id } = created.json();

      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/v1/categories/${id}`,
      });
      expect(deleted.statusCode).toBe(204);
      expect(deleted.body).toBe("");

      const gone = await app.inject({
        method: "GET",
        url: `/api/v1/categories/${id}`,
      });
      expect(gone.statusCode).toBe(404);
    });

    it("returns 404 when deleting a missing category", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/categories/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CATEGORY_NOT_FOUND");
    });
  });
});
