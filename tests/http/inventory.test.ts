import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedApp } from "../helpers/auth.js";
import { buildAuthenticatedApp } from "../helpers/auth.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("inventory HTTP API", () => {
  let context: AuthenticatedApp;

  beforeAll(async () => {
    context = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await context.app.close();
  });

  async function createProduct(stockQuantity: number): Promise<string> {
    const response = await context.inject({
      method: "POST",
      url: "/api/v1/products",
      payload: {
        sku: `INV-${randomUUID()}`,
        name: "Stocked Item",
        priceCents: 1000,
        stockQuantity,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  describe("POST /api/v1/inventory/adjustments", () => {
    it("increases stock and returns 201 with a movement", async () => {
      const productId = await createProduct(2);

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: 5, type: "PURCHASE", reason: "Restock" },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toMatch(UUID_PATTERN);
      expect(body).toMatchObject({
        productId,
        type: "PURCHASE",
        quantity: 5,
        reason: "Restock",
      });
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.headers.location).toBe(
        `/api/v1/inventory/movements?productId=${productId}`,
      );

      const product = await context.inject({
        method: "GET",
        url: `/api/v1/products/${productId}`,
      });
      expect(product.json().stockQuantity).toBe(7);
    });

    it("decreases stock on a negative adjustment", async () => {
      const productId = await createProduct(5);

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: -2, type: "ADJUSTMENT" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().reason).toBeNull();
    });

    it("rejects a removal beyond the stock with 409 INSUFFICIENT_STOCK", async () => {
      const productId = await createProduct(1);

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: -4, type: "ADJUSTMENT" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("INSUFFICIENT_STOCK");
    });

    it("rejects a zero quantity with 400", async () => {
      const productId = await createProduct(3);

      const response = await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: 0, type: "ADJUSTMENT" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an unknown product with 404", async () => {
      const response = await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId: randomUUID(), quantity: 1, type: "PURCHASE" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("rejects a CASHIER with 403 but allows an ADMIN", async () => {
      const productId = await createProduct(1);

      const forbidden = await context.inject(
        {
          method: "POST",
          url: "/api/v1/inventory/adjustments",
          payload: { productId, quantity: 1, type: "PURCHASE" },
        },
        "CASHIER",
      );
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().error.code).toBe("FORBIDDEN");

      const allowed = await context.inject(
        {
          method: "POST",
          url: "/api/v1/inventory/adjustments",
          payload: { productId, quantity: 1, type: "PURCHASE" },
        },
        "ADMIN",
      );
      expect(allowed.statusCode).toBe(201);
    });

    it("requires a session", async () => {
      const response = await context.injectAnonymous({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId: randomUUID(), quantity: 1, type: "PURCHASE" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/inventory/movements", () => {
    it("returns a paginated ledger filtered by product", async () => {
      const productId = await createProduct(0);
      await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: 4, type: "PURCHASE" },
      });
      await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: -1, type: "RETURN", reason: "Damaged box" },
      });

      const response = await context.inject({
        method: "GET",
        url: `/api/v1/inventory/movements?productId=${productId}&sort=createdAt&order=asc`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
      expect(body.data[0]).toMatchObject({ type: "PURCHASE", quantity: 4 });
      expect(body.data[0]._links.product.href).toBe(`/api/v1/products/${productId}`);
      expect(body._links.self.href).toContain("productId=");
    });

    it("filters by movement type", async () => {
      const productId = await createProduct(0);
      await context.inject({
        method: "POST",
        url: "/api/v1/inventory/adjustments",
        payload: { productId, quantity: 2, type: "PURCHASE" },
      });

      const response = await context.inject({
        method: "GET",
        url: `/api/v1/inventory/movements?productId=${productId}&type=PURCHASE`,
      });

      const rows = response.json().data as Array<{ type: string }>;
      expect(rows.every((row) => row.type === "PURCHASE")).toBe(true);
    });

    it("lets a CASHIER read the ledger", async () => {
      const response = await context.inject(
        { method: "GET", url: "/api/v1/inventory/movements" },
        "CASHIER",
      );

      expect(response.statusCode).toBe(200);
    });

    it("requires a session", async () => {
      const response = await context.injectAnonymous({
        method: "GET",
        url: "/api/v1/inventory/movements",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  it("keeps the sale ledger consistent with stock", async () => {
    const productId = await createProduct(5);

    const sale = await context.inject({
      method: "POST",
      url: "/api/v1/sales",
      payload: { items: [{ productId, quantity: 2 }] },
    });
    expect(sale.statusCode).toBe(201);

    const movements = await context.inject({
      method: "GET",
      url: `/api/v1/inventory/movements?productId=${productId}&type=SALE`,
    });
    expect(movements.json().data).toHaveLength(1);
    expect(movements.json().data[0].quantity).toBe(-2);

    await context.inject({
      method: "POST",
      url: `/api/v1/sales/${sale.json().id}/cancel`,
    });

    const afterCancel = await context.inject({
      method: "GET",
      url: `/api/v1/inventory/movements?productId=${productId}&sort=quantity&order=asc`,
    });
    const ledger = afterCancel.json().data as Array<{ type: string; quantity: number }>;
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => [row.type, row.quantity])).toEqual([
      ["SALE", -2],
      ["CANCELLATION", 2],
    ]);

    const product = await context.inject({
      method: "GET",
      url: `/api/v1/products/${productId}`,
    });
    expect(product.json().stockQuantity).toBe(5);
  });
});
