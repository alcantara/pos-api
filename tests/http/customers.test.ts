import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedApp } from "../helpers/auth.js";
import { buildAuthenticatedApp } from "../helpers/auth.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("customers HTTP API", () => {
  let context: AuthenticatedApp;

  beforeAll(async () => {
    context = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function createCustomer(payload: Record<string, unknown>) {
    return context.inject({
      method: "POST",
      url: "/api/v1/customers",
      payload,
    });
  }

  describe("POST /api/v1/customers", () => {
    it("creates a customer with 201, Location and HATEOAS links", async () => {
      const response = await createCustomer({
        name: "Ana Silva",
        email: `ana-${randomUUID()}@example.com`,
        phone: "+5511999990000",
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(UUID_PATTERN);
      expect(body.name).toBe("Ana Silva");
      expect(body.phone).toBe("+5511999990000");
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(response.headers.location).toBe(`/api/v1/customers/${body.id}`);
      expect(body._links).toEqual({
        self: { href: `/api/v1/customers/${body.id}` },
        update: { href: `/api/v1/customers/${body.id}`, method: "PATCH" },
        delete: { href: `/api/v1/customers/${body.id}`, method: "DELETE" },
      });
    });

    it("creates a walk-in customer without contact fields", async () => {
      const response = await createCustomer({ name: "Walk-in" });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.email).toBeNull();
      expect(body.phone).toBeNull();
    });

    it("rejects a duplicate email with 409 CONFLICT", async () => {
      const email = `dup-${randomUUID()}@example.com`;
      await createCustomer({ name: "First", email });
      const response = await createCustomer({ name: "Second", email });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: { code: "CONFLICT", message: expect.stringContaining(email) },
      });
    });

    it("rejects a malformed email with 400 VALIDATION_ERROR", async () => {
      const response = await createCustomer({
        name: "Bad email",
        email: "not-an-email",
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(body.error.details)).toBe(true);
    });

    it("rejects an empty name with 400", async () => {
      const response = await createCustomer({ name: "  " });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects unknown fields with 400", async () => {
      const response = await createCustomer({ name: "X", cpf: "123" });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/customers/:id", () => {
    it("returns the customer", async () => {
      const created = await createCustomer({
        name: "Bruno",
        email: `bruno-${randomUUID()}@example.com`,
      });
      const { id } = created.json();

      const response = await context.inject({
        method: "GET",
        url: `/api/v1/customers/${id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(id);
      expect(body._links.self.href).toBe(`/api/v1/customers/${id}`);
    });

    it("returns 404 CUSTOMER_NOT_FOUND for an unknown id", async () => {
      const response = await context.inject({
        method: "GET",
        url: `/api/v1/customers/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "CUSTOMER_NOT_FOUND", message: expect.any(String) },
      });
    });

    it("returns 400 for a malformed id", async () => {
      const response = await context.inject({
        method: "GET",
        url: "/api/v1/customers/not-a-uuid",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/customers", () => {
    const token = `W${randomUUID().slice(0, 8)}`;

    it("returns pagination envelope with prev/next links", async () => {
      await createCustomer({ name: `${token} gamma` });
      await createCustomer({ name: `${token} alpha` });
      await createCustomer({ name: `${token} beta` });

      const first = await context.inject({
        method: "GET",
        url: `/api/v1/customers?search=${token}&limit=2&page=1&sort=name&order=asc`,
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

      const second = await context.inject({
        method: "GET",
        url: `/api/v1/customers?search=${token}&limit=2&page=2&sort=name&order=asc`,
      });
      const secondBody = second.json();
      expect(secondBody.data).toHaveLength(1);
      expect(secondBody._links.prev.href).toContain("page=1");
      expect(secondBody._links.next).toBeUndefined();
    });

    it("finds customers by email and phone fragments", async () => {
      const email = `find-${randomUUID()}@example.com`;
      await createCustomer({ name: "Findable", email, phone: "11977776666" });

      const byEmail = await context.inject({
        method: "GET",
        url: `/api/v1/customers?search=${email.split("@")[0]}`,
      });
      expect(byEmail.json().pagination.total).toBeGreaterThanOrEqual(1);

      const byPhone = await context.inject({
        method: "GET",
        url: "/api/v1/customers?search=77776666",
      });
      expect(byPhone.json().pagination.total).toBe(1);
    });

    it("rejects limit above 100 with 400", async () => {
      const response = await context.inject({
        method: "GET",
        url: "/api/v1/customers?limit=101",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects a sort field outside the allowlist with 400", async () => {
      const response = await context.inject({
        method: "GET",
        url: "/api/v1/customers?sort=email",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PATCH /api/v1/customers/:id", () => {
    it("applies partial updates", async () => {
      const created = await createCustomer({
        name: "Old name",
        email: `old-${randomUUID()}@example.com`,
      });
      const { id } = created.json();

      const response = await context.inject({
        method: "PATCH",
        url: `/api/v1/customers/${id}`,
        payload: { name: "New name" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe("New name");
      expect(body.email).toBe(created.json().email);
    });

    it("clears the email when set to null", async () => {
      const email = `clear-${randomUUID()}@example.com`;
      const created = await createCustomer({ name: "Clearable", email });

      const response = await context.inject({
        method: "PATCH",
        url: `/api/v1/customers/${created.json().id}`,
        payload: { email: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().email).toBeNull();
    });

    it("rejects an empty body with 400", async () => {
      const created = await createCustomer({ name: "Empty patch target" });

      const response = await context.inject({
        method: "PATCH",
        url: `/api/v1/customers/${created.json().id}`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a missing customer", async () => {
      const response = await context.inject({
        method: "PATCH",
        url: `/api/v1/customers/${randomUUID()}`,
        payload: { name: "x" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CUSTOMER_NOT_FOUND");
    });
  });

  describe("DELETE /api/v1/customers/:id", () => {
    it("deletes with 204 and the customer is gone", async () => {
      const created = await createCustomer({ name: "Disposable customer" });
      const { id } = created.json();

      const deleted = await context.inject({
        method: "DELETE",
        url: `/api/v1/customers/${id}`,
      });
      expect(deleted.statusCode).toBe(204);
      expect(deleted.body).toBe("");

      const gone = await context.inject({
        method: "GET",
        url: `/api/v1/customers/${id}`,
      });
      expect(gone.statusCode).toBe(404);
    });

    it("returns 404 when deleting a missing customer", async () => {
      const response = await context.inject({
        method: "DELETE",
        url: `/api/v1/customers/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("CUSTOMER_NOT_FOUND");
    });
  });
});
