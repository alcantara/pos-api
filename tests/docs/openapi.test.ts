import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { API_PREFIX } from "../../src/interfaces/http/hateoas.js";

interface Operation {
  operationId?: string;
  tags?: string[];
  responses?: Record<string, unknown>;
  security?: unknown[];
}

interface Spec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  };
}

const specPath = fileURLToPath(new URL("../../docs/openapi.yaml", import.meta.url));
const spec = parse(readFileSync(specPath, "utf8")) as Spec;

const HTTP_METHODS = ["get", "post", "patch", "delete", "put"] as const;

/**
 * These tests exist so the published spec cannot silently drift from the code.
 * A hand-written spec rots; one checked against the routes does not.
 */

/** Every route the application registers. */
const REGISTERED_ROUTES: Array<{ method: string; path: string }> = [
  { method: "get", path: "/auth/login" },
  { method: "get", path: "/auth/callback" },
  { method: "get", path: "/auth/me" },
  { method: "post", path: "/auth/logout" },
  { method: "get", path: "/categories" },
  { method: "post", path: "/categories" },
  { method: "get", path: "/categories/{id}" },
  { method: "patch", path: "/categories/{id}" },
  { method: "delete", path: "/categories/{id}" },
  { method: "get", path: "/products" },
  { method: "post", path: "/products" },
  { method: "get", path: "/products/{id}" },
  { method: "patch", path: "/products/{id}" },
  { method: "delete", path: "/products/{id}" },
  { method: "get", path: "/customers" },
  { method: "post", path: "/customers" },
  { method: "get", path: "/customers/{id}" },
  { method: "patch", path: "/customers/{id}" },
  { method: "delete", path: "/customers/{id}" },
  { method: "get", path: "/sales" },
  { method: "post", path: "/sales" },
  { method: "get", path: "/sales/{id}" },
  { method: "post", path: "/sales/{id}/cancel" },
  { method: "get", path: "/inventory/movements" },
  { method: "post", path: "/inventory/adjustments" },
];

/** Routes reachable without a session. */
const PUBLIC_ROUTES: Array<{ method: string; path: string }> = [
  { method: "get", path: "/auth/login" },
  { method: "get", path: "/auth/callback" },
];

/**
 * `$ref` targets are not inlined by a plain YAML parse, so assertions that look
 * for a header name inside an operation would fail against a perfectly valid
 * document. Local `#/components/...` pointers are resolved before asserting.
 */
function resolveRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(resolveRefs);
  if (value === null || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  const ref = record.$ref;
  if (typeof ref === "string" && ref.startsWith("#/")) {
    const target = ref
      .slice(2)
      .split("/")
      .reduce<unknown>(
        (node, segment) =>
          node !== null && typeof node === "object"
            ? (node as Record<string, unknown>)[segment]
            : undefined,
        spec as unknown,
      );
    return resolveRefs(target);
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, resolveRefs(item)]),
  );
}

interface Entry {
  method: string;
  path: string;
  operation: Operation;
}

function specOperations(): Entry[] {
  const found: Entry[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (operation) found.push({ method, path, operation });
    }
  }
  return found;
}

const operations: Entry[] = specOperations().map((entry) => ({
  ...entry,
  operation: resolveRefs(entry.operation) as Operation,
}));

function operationAt(method: string, path: string): Operation {
  const found = operations.find(
    (entry) => entry.method === method && entry.path === path,
  );
  if (!found) throw new Error(`${method} ${path} missing from the spec`);
  return found.operation;
}

/** YAML block scalars keep line breaks, so assertions collapse whitespace first. */
function flattenedDescription(): string {
  return (spec.info.description ?? "").replace(/\s+/g, " ");
}

function labels(entries: Entry[]): string[] {
  return entries.map((entry) => `${entry.method} ${entry.path}`);
}

describe("OpenAPI document", () => {
  it("declares OpenAPI 3.1 with title and version", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("POS API");
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("targets the versioned API prefix", () => {
    expect(spec.servers[0]?.url).toContain(API_PREFIX);
  });

  it("defines the cookie security scheme used by session routes", () => {
    expect(spec.components.securitySchemes?.sessionCookie).toBeDefined();
  });

  it("has reusable components", () => {
    expect(Object.keys(spec.components.schemas ?? {}).length).toBeGreaterThan(5);
    expect(Object.keys(spec.components.responses ?? {}).length).toBeGreaterThan(5);
  });
});

describe("routes and specification agree", () => {
  it("documents every registered route", () => {
    const documented = new Set(labels(specOperations()));

    for (const route of REGISTERED_ROUTES) {
      expect(documented).toContain(`${route.method} ${route.path}`);
    }
  });

  it("documents no route that the application does not register", () => {
    const registered = new Set(
      REGISTERED_ROUTES.map(
        ({ method, path }) => `${method} ${path.replace(/:([A-Za-z]+)/g, "{$1}")}`,
      ),
    );

    for (const entry of specOperations()) {
      expect(registered).toContain(`${entry.method} ${entry.path}`);
    }
  });

  it("covers exactly the registered operations", () => {
    expect(operations).toHaveLength(REGISTERED_ROUTES.length);
  });
});

describe("every operation is documented", () => {
  it("has operations to check", () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it.each(
    operations.map(
      (entry) => [`${entry.method} ${entry.path}`, entry.operation] as const,
    ),
  )("%s has an operationId, tags and responses", (_label, operation) => {
    expect(operation.operationId).toBeTruthy();
    expect(operation.tags?.length ?? 0).toBeGreaterThan(0);
    expect(Object.keys(operation.responses ?? {}).length).toBeGreaterThan(0);
  });

  it("declares unique operationIds", () => {
    const ids = operations.map((entry) => entry.operation.operationId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only tags declared in the document", () => {
    const declared = new Set(
      ((spec as unknown as { tags?: Array<{ name: string }> }).tags ?? []).map(
        (tag) => tag.name,
      ),
    );

    for (const entry of operations) {
      for (const tag of entry.operation.tags ?? []) {
        expect(declared).toContain(tag);
      }
    }
  });
});

describe("authorization matches the implemented matrix", () => {
  const protectedRoutes = REGISTERED_ROUTES.filter(
    (route) =>
      !PUBLIC_ROUTES.some(
        (open) => open.method === route.method && open.path === route.path,
      ),
  );

  it("has protected routes to check", () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
  });

  it.each(
    protectedRoutes.map((route) => [`${route.method} ${route.path}`, route] as const),
  )("%s requires the session cookie", (_label, route) => {
    expect(operationAt(route.method, route.path).security).toBeUndefined();
  });

  it.each(
    PUBLIC_ROUTES.map((route) => [`${route.method} ${route.path}`, route] as const),
  )("%s is public", (_label, route) => {
    expect(operationAt(route.method, route.path).security).toEqual([]);
  });

  it("documents the cancellation and adjustment roles in the description", () => {
    expect(flattenedDescription()).toContain("Cancel a sale");
    expect(flattenedDescription()).toContain("Adjust stock");
  });
});

describe("write operations require the CSRF header", () => {
  const unsafe = operations.filter(({ method }) => method !== "get");

  it("has unsafe operations to check", () => {
    expect(unsafe.length).toBeGreaterThan(0);
  });

  it.each(
    unsafe.map((entry) => [`${entry.method} ${entry.path}`, entry.operation] as const),
  )("%s declares x-csrf-token", (_label, operation) => {
    expect(JSON.stringify(operation)).toContain("x-csrf-token");
  });
});

describe("sales document idempotency and pricing guarantees", () => {
  it("accepts an Idempotency-Key header on creation", () => {
    expect(JSON.stringify(operationAt("post", "/sales"))).toContain("idempotency-key");
  });

  it("documents both the created and the replayed response", () => {
    const responses = operationAt("post", "/sales").responses ?? {};

    expect(Object.keys(responses)).toContain("200");
    expect(Object.keys(responses)).toContain("201");
  });

  it("states that prices come from the database", () => {
    expect(flattenedDescription()).toContain("priced from the product row");
  });

  it("rejects insufficient stock with 409", () => {
    expect(Object.keys(operationAt("post", "/sales").responses ?? {})).toContain("409");
  });
});

describe("error responses are documented", () => {
  const sessionRoutes = operations.filter(
    (entry) => entry.operation.security?.length !== 0,
  );

  it("has session routes to check", () => {
    expect(sessionRoutes.length).toBeGreaterThan(0);
  });

  it.each(
    sessionRoutes.map(
      (entry) => [`${entry.method} ${entry.path}`, entry.operation] as const,
    ),
  )("%s documents 401", (_label, operation) => {
    expect(Object.keys(operation.responses ?? {})).toContain("401");
  });

  it("documents 429 on the read collections", () => {
    for (const path of ["/products", "/categories"]) {
      expect(Object.keys(operationAt("get", path).responses ?? {})).toContain("429");
    }
  });

  it("documents 404 on every item lookup", () => {
    for (const path of [
      "/products/{id}",
      "/categories/{id}",
      "/customers/{id}",
      "/sales/{id}",
    ]) {
      expect(Object.keys(operationAt("get", path).responses ?? {})).toContain("404");
    }
  });

  it("documents 403 where a role or the CSRF token is required", () => {
    for (const [method, path] of [
      ["post", "/sales/{id}/cancel"],
      ["post", "/inventory/adjustments"],
      ["post", "/auth/logout"],
    ] as const) {
      expect(Object.keys(operationAt(method, path).responses ?? {})).toContain("403");
    }
  });
});
