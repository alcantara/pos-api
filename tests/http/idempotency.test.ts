import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedApp } from "../helpers/auth.js";
import { buildAuthenticatedApp } from "../helpers/auth.js";

describe("POST /api/v1/sales with Idempotency-Key", () => {
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
        sku: `IDEM-${randomUUID()}`,
        name: "Retried Item",
        priceCents: 1200,
        stockQuantity,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  function sale(productId: string, quantity: number) {
    return {
      method: "POST" as const,
      url: "/api/v1/sales",
      payload: { items: [{ productId, quantity }] },
    };
  }

  it("creates the sale on the first request", async () => {
    const productId = await createProduct(5);

    const response = await context.inject({
      ...sale(productId, 2),
      headers: { "idempotency-key": `key-${randomUUID()}` },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["idempotent-replayed"]).toBeUndefined();
    expect(response.headers.location).toBe(`/api/v1/sales/${response.json().id}`);
  });

  it("replays the original sale with 200 and the replay header", async () => {
    const productId = await createProduct(5);
    const key = `key-${randomUUID()}`;

    const first = await context.inject({
      ...sale(productId, 2),
      headers: { "idempotency-key": key },
    });
    const second = await context.inject({
      ...sale(productId, 2),
      headers: { "idempotency-key": key },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.json().id).toBe(first.json().id);
    expect(second.json().totalCents).toBe(first.json().totalCents);

    const product = await context.inject({
      method: "GET",
      url: `/api/v1/products/${productId}`,
    });
    expect(product.json().stockQuantity).toBe(3);
  });

  it("answers 409 when the same key carries a different body", async () => {
    const productId = await createProduct(9);
    const key = `key-${randomUUID()}`;

    await context.inject({
      ...sale(productId, 1),
      headers: { "idempotency-key": key },
    });
    const conflict = await context.inject({
      ...sale(productId, 5),
      headers: { "idempotency-key": key },
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("CONFLICT");
    expect(conflict.json().error.message).toContain("Idempotency-Key");

    const product = await context.inject({
      method: "GET",
      url: `/api/v1/products/${productId}`,
    });
    expect(product.json().stockQuantity).toBe(8);
  });

  it("scopes the key to the acting user", async () => {
    const productId = await createProduct(9);
    const key = `key-${randomUUID()}`;

    const manager = await context.inject({
      ...sale(productId, 1),
      headers: { "idempotency-key": key },
    });
    const cashier = await context.inject(
      { ...sale(productId, 1), headers: { "idempotency-key": key } },
      "CASHIER",
    );

    expect(manager.statusCode).toBe(201);
    expect(cashier.statusCode).toBe(201);
    expect(cashier.headers["idempotent-replayed"]).toBeUndefined();
    expect(cashier.json().id).not.toBe(manager.json().id);
    expect(cashier.json().userId).toBe(context.users.CASHIER.id);
  });

  it("never sells twice when a client retries concurrently", async () => {
    const productId = await createProduct(10);
    const key = `key-${randomUUID()}`;

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        context.inject({ ...sale(productId, 2), headers: { "idempotency-key": key } }),
      ),
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      200, 200, 201,
    ]);
    const ids = new Set(responses.map((response) => String(response.json().id)));
    expect(ids.size).toBe(1);

    const product = await context.inject({
      method: "GET",
      url: `/api/v1/products/${productId}`,
    });
    expect(product.json().stockQuantity).toBe(8);
  });

  it("rejects an empty, oversized or non-printable key with 400", async () => {
    const productId = await createProduct(5);

    const empty = await context.inject({
      ...sale(productId, 1),
      headers: { "idempotency-key": " " },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe("VALIDATION_ERROR");

    const oversized = await context.inject({
      ...sale(productId, 1),
      headers: { "idempotency-key": "k".repeat(201) },
    });
    expect(oversized.statusCode).toBe(400);

    const spaced = await context.inject({
      ...sale(productId, 1),
      headers: { "idempotency-key": "has space" },
    });
    expect(spaced.statusCode).toBe(400);

    const product = await context.inject({
      method: "GET",
      url: `/api/v1/products/${productId}`,
    });
    expect(product.json().stockQuantity).toBe(5);
  });

  it("does not record a key for a rejected body", async () => {
    const productId = await createProduct(5);
    const key = `key-${randomUUID()}`;

    const rejected = await context.inject({
      ...sale(productId, 99),
      headers: { "idempotency-key": key },
    });
    expect(rejected.statusCode).toBe(409);

    const retried = await context.inject({
      ...sale(productId, 1),
      headers: { "idempotency-key": key },
    });
    expect(retried.statusCode).toBe(201);
  });
});
