import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import {
  SPEC_RELATIVE_PATH,
  loadOpenApiDocument,
  locateSpecFile,
} from "../../src/interfaces/http/docs.js";

describe("served OpenAPI documentation", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        COOKIE_SECRET: "s".repeat(48),
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the Swagger UI shell at /docs", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("swagger");
  });

  it("serves the contract at /docs/json", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual(loadOpenApiDocument());
  });

  it("serves the exact file the spec tests validate", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = loadOpenApiDocument() ?? {};

    expect(response.json().openapi).toBe(document.openapi);
    expect(Object.keys(response.json().paths as object)).toEqual(
      Object.keys(document.paths as object),
    );
  });

  it("serves the UI assets locally, without a CDN", async () => {
    const html = await app.inject({ method: "GET", url: "/docs" });

    expect(html.body).not.toContain("https://unpkg.com");
    expect(html.body).not.toContain("cdn.jsdelivr.net");
  });

  it("points the UI at the local spec route", async () => {
    const initializer = await app.inject({
      method: "GET",
      url: "/docs/static/swagger-initializer.js",
    });

    expect(initializer.statusCode).toBe(200);
    expect(initializer.body).toContain("/docs/json");
  });

  it("applies the hardening headers to the docs routes", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
  });

  it("does not require a session", async () => {
    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.statusCode).toBe(200);
  });
});

describe("documentation can be disabled", () => {
  it("is served by default outside production", async () => {
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        COOKIE_SECRET: "s".repeat(48),
      }),
    );

    try {
      expect((await app.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it("is off in production by default", async () => {
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "production",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        COOKIE_SECRET: "s".repeat(48),
      }),
    );

    try {
      expect((await app.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(
        404,
      );
    } finally {
      await app.close();
    }
  });

  it("can be enabled explicitly in production", async () => {
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "production",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        COOKIE_SECRET: "s".repeat(48),
        DOCS_ENABLED: "true",
      }),
    );

    try {
      expect((await app.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it("can be disabled outside production", async () => {
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        COOKIE_SECRET: "s".repeat(48),
        DOCS_ENABLED: "false",
      }),
    );

    try {
      expect((await app.inject({ method: "GET", url: "/docs/json" })).statusCode).toBe(
        404,
      );
    } finally {
      await app.close();
    }
  });
});

describe("spec discovery", () => {
  it("finds the repository document without a hard-coded relative path", () => {
    const located = locateSpecFile();

    expect(located).not.toBeNull();
    expect(located?.endsWith(SPEC_RELATIVE_PATH)).toBe(true);
    expect(basename(located as string)).toBe(basename(SPEC_RELATIVE_PATH));
    expect(existsSync(located as string)).toBe(true);
  });

  it("honours an explicit path", () => {
    const located = locateSpecFile(resolve("docs/openapi.yaml"));

    expect(located).toBe(resolve("docs/openapi.yaml"));
  });

  it("returns null for a path that does not exist", () => {
    expect(locateSpecFile(resolve("docs/does-not-exist.yaml"))).toBeNull();
  });

  it("parses the document from an explicit path", () => {
    expect(loadOpenApiDocument(resolve("docs/openapi.yaml"))?.openapi).toMatch(/^3\./);
  });

  it("returns null instead of throwing for a missing document", () => {
    expect(loadOpenApiDocument(resolve("docs/does-not-exist.yaml"))).toBeNull();
  });
});

describe("a build without the document still boots", () => {
  it("logs a warning instead of throwing", async () => {
    const app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        COOKIE_SECRET: "s".repeat(48),
        OPENAPI_DOCS_PATH: resolve("docs/does-not-exist.yaml"),
      }),
    );

    try {
      expect((await app.inject({ method: "GET", url: "/docs" })).statusCode).toBe(404);
      // The API itself is unaffected.
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });
});
