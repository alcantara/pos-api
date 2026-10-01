import { randomUUID } from "node:crypto";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionToken } from "../../src/application/auth/session.js";
import { loadEnv } from "../../src/config/env.js";
import { buildApp } from "../../src/app.js";
import type { AuthenticatedApp } from "../helpers/auth.js";
import { buildAuthenticatedApp, TEST_COOKIE_SECRET } from "../helpers/auth.js";

interface ManagedRoute {
  resource: string;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  payload?: InjectOptions["payload"];
}

const MANAGED: ManagedRoute[] = [
  {
    resource: "products",
    method: "POST",
    url: "/api/v1/products",
    payload: { sku: "RB-1", name: "RBAC Product", priceCents: 100 },
  },
  {
    resource: "products",
    method: "PATCH",
    url: `/api/v1/products/${randomUUID()}`,
    payload: { name: "Renamed" },
  },
  { resource: "products", method: "DELETE", url: `/api/v1/products/${randomUUID()}` },
  {
    resource: "categories",
    method: "POST",
    url: "/api/v1/categories",
    payload: { name: "RBAC Category" },
  },
  {
    resource: "categories",
    method: "PATCH",
    url: `/api/v1/categories/${randomUUID()}`,
    payload: { name: "Renamed" },
  },
  {
    resource: "categories",
    method: "DELETE",
    url: `/api/v1/categories/${randomUUID()}`,
  },
  {
    resource: "customers",
    method: "POST",
    url: "/api/v1/customers",
    payload: { name: "RBAC Customer" },
  },
  {
    resource: "customers",
    method: "PATCH",
    url: `/api/v1/customers/${randomUUID()}`,
    payload: { name: "Renamed" },
  },
  { resource: "customers", method: "DELETE", url: `/api/v1/customers/${randomUUID()}` },
];

const READS = ["products", "categories", "customers"].map(
  (resource) => `/api/v1/${resource}`,
);

describe("role-based access control", () => {
  let context: AuthenticatedApp;

  beforeAll(async () => {
    context = await buildAuthenticatedApp();
  });

  afterAll(async () => {
    await context.app.close();
  });

  describe("without a session", () => {
    it.each([...READS, ...MANAGED.map((entry) => entry.url)])(
      "answers 401 UNAUTHORIZED for %s",
      async (url) => {
        const response = await context.injectAnonymous({ method: "GET", url });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: { code: "UNAUTHORIZED", message: expect.any(String) },
        });
      },
    );

    it("rejects a write even when the body is valid", async () => {
      const response = await context.injectAnonymous({
        method: "POST",
        url: "/api/v1/products",
        payload: { sku: "ANON-1", name: "Anonymous", priceCents: 100 },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("with an invalid session", () => {
    it("rejects a tampered cookie", async () => {
      const response = await context.injectAnonymous({
        method: "GET",
        url: "/api/v1/products",
        headers: { cookie: "pos_session=not-a-token" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects a token signed with another secret", async () => {
      const forged = createSessionToken(context.users.ADMIN.id, "x".repeat(48));

      const response = await context.injectAnonymous({
        method: "GET",
        url: "/api/v1/products",
        headers: { cookie: `pos_session=${forged}` },
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects a valid token whose user no longer exists", async () => {
      const orphan = createSessionToken(randomUUID(), TEST_COOKIE_SECRET);

      const response = await context.injectAnonymous({
        method: "GET",
        url: "/api/v1/products",
        headers: { cookie: `pos_session=${orphan}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.message).toContain("no longer exists");
    });
  });

  describe("CASHIER", () => {
    it.each(READS)("may read %s", async (url) => {
      const response = await context.inject({ method: "GET", url }, "CASHIER");

      expect(response.statusCode).toBe(200);
      expect(response.json().pagination).toBeDefined();
    });

    it("may read a single resource", async () => {
      const created = await context.inject(
        {
          method: "POST",
          url: "/api/v1/categories",
          payload: { name: "Cashier Read" },
        },
        "MANAGER",
      );
      const response = await context.inject(
        { method: "GET", url: `/api/v1/categories/${created.json().id}` },
        "CASHIER",
      );

      expect(response.statusCode).toBe(200);
    });

    it.each(MANAGED)("may not $method $resource", async ({ method, url, payload }) => {
      const response = await context.inject({ method, url, payload }, "CASHIER");

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: "FORBIDDEN", message: expect.stringContaining("CASHIER") },
      });
    });
  });

  describe("MANAGER", () => {
    it("may create a category", async () => {
      const response = await context.inject(
        {
          method: "POST",
          url: "/api/v1/categories",
          payload: { name: "Manager Category" },
        },
        "MANAGER",
      );

      expect(response.statusCode).toBe(201);
    });

    it("may delete a product", async () => {
      const created = await context.inject(
        {
          method: "POST",
          url: "/api/v1/products",
          payload: {
            sku: `MGR-${randomUUID().slice(0, 8)}`,
            name: "Manager",
            priceCents: 100,
          },
        },
        "MANAGER",
      );

      const response = await context.inject(
        { method: "DELETE", url: `/api/v1/products/${created.json().id}` },
        "MANAGER",
      );

      expect(response.statusCode).toBe(204);
    });
  });

  describe("ADMIN", () => {
    it("may create a product", async () => {
      const response = await context.inject(
        {
          method: "POST",
          url: "/api/v1/products",
          payload: {
            sku: `ADM-${randomUUID().slice(0, 8)}`,
            name: "Admin",
            priceCents: 100,
          },
        },
        "ADMIN",
      );

      expect(response.statusCode).toBe(201);
    });
  });

  describe("role changes take effect on the next request", () => {
    it("blocks a demoted CASHIER immediately", async () => {
      const user = context.users.CASHIER;
      await context.dependencies.users.update({ ...user, role: "MANAGER" });

      const promoted = await context.inject(
        { method: "POST", url: "/api/v1/categories", payload: { name: "Promoted" } },
        "CASHIER",
      );
      expect(promoted.statusCode).toBe(201);

      await context.dependencies.users.update(user);

      const demoted = await context.inject(
        { method: "POST", url: "/api/v1/categories", payload: { name: "Demoted" } },
        "CASHIER",
      );
      expect(demoted.statusCode).toBe(403);
    });
  });
});

describe("authorization fails closed without a cookie secret", () => {
  it("answers 503 AUTH_NOT_CONFIGURED on protected routes", async () => {
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
      }),
    );

    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/products" });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("AUTH_NOT_CONFIGURED");
    } finally {
      await app.close();
    }
  });
});
