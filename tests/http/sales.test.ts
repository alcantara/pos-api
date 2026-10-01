import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedApp } from "../helpers/auth.js";
import { buildAuthenticatedApp } from "../helpers/auth.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("sales HTTP API", () => {
  let context: AuthenticatedApp;
  const productIds: string[] = [];
  let cashierId: string;
  let managerId: string;

  beforeAll(async () => {
    context = await buildAuthenticatedApp();
    cashierId = context.users.CASHIER.id;
    managerId = context.users.MANAGER.id;
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function createProduct(
    overrides: { stockQuantity?: number; priceCents?: number } = {},
  ): Promise<string> {
    const response = await context.inject(
      {
        method: "POST",
        url: "/api/v1/products",
        payload: {
          sku: `SALE-${randomUUID()}`,
          name: "Sold Item",
          priceCents: overrides.priceCents ?? 1500,
          stockQuantity: overrides.stockQuantity ?? 10,
        },
      },
      "MANAGER",
    );
    expect(response.statusCode).toBe(201);
    const id = response.json().id as string;
    productIds.push(id);
    return id;
  }

  describe("POST /api/v1/sales", () => {
    it("creates a sale with 201, Location and HATEOAS links", async () => {
      const productId = await createProduct({ stockQuantity: 5, priceCents: 2500 });

      const response = await context.inject(
        {
          method: "POST",
          url: "/api/v1/sales",
          payload: { items: [{ productId, quantity: 2 }] },
        },
        "CASHIER",
      );

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(UUID_PATTERN);
      expect(body.status).toBe("COMPLETED");
      expect(body.totalCents).toBe(5000);
      expect(body.userId).toBe(cashierId);
      expect(body.customerId).toBeNull();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        productId,
        quantity: 2,
        unitPriceCents: 2500,
        subtotalCents: 5000,
      });
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.headers.location).toBe(`/api/v1/sales/${body.id}`);
      expect(body._links).toEqual({
        self: { href: `/api/v1/sales/${body.id}` },
        cancel: { href: `/api/v1/sales/${body.id}/cancel`, method: "POST" },
      });
    });

    it("decrements stock and attaches the customer when informed", async () => {
      const productId = await createProduct({ stockQuantity: 4 });
      const customer = await context.inject({
        method: "POST",
        url: "/api/v1/customers",
        payload: { name: "Buyer" },
      });
      const customerId = customer.json().id as string;

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { customerId, items: [{ productId, quantity: 3 }] },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().customerId).toBe(customerId);
      const product = await context.inject({
        method: "GET",
        url: `/api/v1/products/${productId}`,
      });
      expect(product.json().stockQuantity).toBe(1);
    });

    it("sums multiple lines", async () => {
      const first = await createProduct({ stockQuantity: 5, priceCents: 1000 });
      const second = await createProduct({ stockQuantity: 5, priceCents: 2500 });

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: {
          items: [
            { productId: first, quantity: 2 },
            { productId: second, quantity: 3 },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().totalCents).toBe(2 * 1000 + 3 * 2500);
      expect(response.json().items).toHaveLength(2);
    });

    it("rejects insufficient stock with 409 INSUFFICIENT_STOCK", async () => {
      const productId = await createProduct({ stockQuantity: 1 });

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 2 }] },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: "INSUFFICIENT_STOCK",
          message: expect.stringContaining("1 in stock"),
        },
      });
    });

    it("rejects an unknown product with 404 PRODUCT_NOT_FOUND", async () => {
      const response = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId: randomUUID(), quantity: 1 }] },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("rejects an empty cart, bad quantities and repeated products", async () => {
      const productId = await createProduct({ stockQuantity: 5 });

      const empty = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [] },
      });
      expect(empty.statusCode).toBe(400);
      expect(empty.json().error.code).toBe("VALIDATION_ERROR");

      const zero = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 0 }] },
      });
      expect(zero.statusCode).toBe(400);

      const repeated = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: {
          items: [
            { productId, quantity: 1 },
            { productId, quantity: 1 },
          ],
        },
      });
      expect(repeated.statusCode).toBe(400);
      expect(repeated.json().error.details?.[0]?.path).toBe("items.1.productId");
    });

    it("rejects unknown fields with 400", async () => {
      const response = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [], discount: 10 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("never trusts a client-supplied price", async () => {
      const productId = await createProduct({ stockQuantity: 2, priceCents: 999 });

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 1, unitPriceCents: 1 }] },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/sales", () => {
    it("returns a paginated envelope with filter support", async () => {
      await createProduct({ stockQuantity: 20 });
      const response = await context.inject({
        method: "GET",
        url: "/api/v1/sales?page=1&limit=2&status=COMPLETED&sort=createdAt&order=desc",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
      expect(body._links.self).toBeDefined();
      expect(body._links.create).toEqual({
        href: "/api/v1/sales",
        method: "POST",
      });

      const byId = await context.inject({
        method: "GET",
        url: `/api/v1/sales?customerId=${randomUUID()}`,
      });
      expect(byId.json().pagination.total).toBe(0);
    });

    it("answers 404 SALE_NOT_FOUND for an unknown id", async () => {
      const response = await context.inject({
        method: "GET",
        url: `/api/v1/sales/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("SALE_NOT_FOUND");
    });

    it("returns the sale with its items", async () => {
      const productId = await createProduct({ stockQuantity: 3, priceCents: 700 });
      const created = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 2 }] },
      });

      const response = await context.inject({
        method: "GET",
        url: `/api/v1/sales/${created.json().id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().items[0].subtotalCents).toBe(1400);
    });
  });

  describe("POST /api/v1/sales/:id/cancel", () => {
    it("cancels the sale, restores stock and drops the cancel link", async () => {
      const productId = await createProduct({ stockQuantity: 5 });
      const created = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 4 }] },
      });
      const saleId = created.json().id as string;

      const response = await context.inject({
        method: "POST",
        url: `/api/v1/sales/${saleId}/cancel`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("CANCELLED");
      expect(response.json()._links.cancel).toBeUndefined();

      const product = await context.inject({
        method: "GET",
        url: `/api/v1/products/${productId}`,
      });
      expect(product.json().stockQuantity).toBe(5);
    });

    it("refuses to cancel twice with 409", async () => {
      const productId = await createProduct({ stockQuantity: 5 });
      const created = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 1 }] },
      });
      const saleId = created.json().id as string;
      await context.inject({ method: "POST", url: `/api/v1/sales/${saleId}/cancel` });

      const response = await context.inject({
        method: "POST",
        url: `/api/v1/sales/${saleId}/cancel`,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
    });

    it("refuses a CASHIER with 403 but allows a MANAGER", async () => {
      const productId = await createProduct({ stockQuantity: 5 });
      const created = await context.inject({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId, quantity: 1 }] },
      });
      const saleId = created.json().id as string;

      const forbidden = await context.inject(
        { method: "POST", url: `/api/v1/sales/${saleId}/cancel` },
        "CASHIER",
      );
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().error.code).toBe("FORBIDDEN");

      const allowed = await context.inject(
        { method: "POST", url: `/api/v1/sales/${saleId}/cancel` },
        "MANAGER",
      );
      expect(allowed.statusCode).toBe(200);
    });

    it("answers 404 for an unknown sale", async () => {
      const response = await context.inject({
        method: "POST",
        url: `/api/v1/sales/${randomUUID()}/cancel`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("SALE_NOT_FOUND");
    });

    it("attributes the sale to the acting user", async () => {
      const productId = await createProduct({ stockQuantity: 2 });

      const response = await context.inject(
        {
          method: "POST",
          url: "/api/v1/sales",
          payload: { items: [{ productId, quantity: 1 }] },
        },
        "CASHIER",
      );

      expect(response.json().userId).toBe(cashierId);
      expect(response.json().userId).not.toBe(managerId);
    });
  });

  describe("authorization", () => {
    it("requires a session", async () => {
      const response = await context.injectAnonymous({
        method: "POST",
        url: "/api/v1/sales",
        payload: { items: [{ productId: randomUUID(), quantity: 1 }] },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("lets a CASHIER sell but not read another user's session", async () => {
      const productId = await createProduct({ stockQuantity: 1 });

      const created = await context.inject(
        {
          method: "POST",
          url: "/api/v1/sales",
          payload: { items: [{ productId, quantity: 1 }] },
        },
        "CASHIER",
      );

      expect(created.statusCode).toBe(201);
      const read = await context.inject({
        method: "GET",
        url: `/api/v1/sales/${created.json().id}`,
      });
      expect(read.statusCode).toBe(200);
    });
  });
});
