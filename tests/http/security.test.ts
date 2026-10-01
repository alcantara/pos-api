import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { loadSecurityConfig } from "../../src/config/security.js";
import { createRateLimiter } from "../../src/interfaces/http/errors.js";

describe("loadSecurityConfig", () => {
  it("applies safe defaults", () => {
    const config = loadSecurityConfig({});

    expect(config).toEqual({
      rateLimitMax: 120,
      rateLimitWindowMs: 60_000,
      corsOrigins: null,
      csrfProtection: true,
    });
  });

  it("treats empty strings as unset", () => {
    const config = loadSecurityConfig({ CORS_ORIGINS: "" });

    expect(config.corsOrigins).toBeNull();
  });

  it("splits and trims the CORS allowlist", () => {
    const config = loadSecurityConfig({
      CORS_ORIGINS: "https://pos.example, https://admin.example",
    });

    expect(config.corsOrigins).toEqual([
      "https://pos.example",
      "https://admin.example",
    ]);
  });

  it("can disable CSRF protection explicitly", () => {
    expect(loadSecurityConfig({ CSRF_PROTECTION: "false" }).csrfProtection).toBe(false);
    expect(loadSecurityConfig({ CSRF_PROTECTION: "true" }).csrfProtection).toBe(true);
  });

  it.each([
    ["RATE_LIMIT_MAX", "0"],
    ["RATE_LIMIT_MAX", "1.5"],
    ["RATE_LIMIT_WINDOW_MS", "10"],
  ])("rejects an invalid %s=%s", (key, value) => {
    expect(() => loadSecurityConfig({ [key]: value })).toThrow(
      /Invalid security configuration/,
    );
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit and then rejects with a retry hint", () => {
    const limiter = createRateLimiter(3, 60_000);

    expect(limiter("ip").allowed).toBe(true);
    expect(limiter("ip").allowed).toBe(true);
    const third = limiter("ip");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = limiter("ip");
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key independently", () => {
    const limiter = createRateLimiter(1, 60_000);

    expect(limiter("a").allowed).toBe(true);
    expect(limiter("a").allowed).toBe(false);
    expect(limiter("b").allowed).toBe(true);
  });

  it("resets once the window has elapsed", () => {
    vi.useFakeTimers();
    try {
      const limiter = createRateLimiter(1, 60_000);

      expect(limiter("ip").allowed).toBe(true);
      expect(limiter("ip").allowed).toBe(false);

      vi.advanceTimersByTime(60_001);
      expect(limiter("ip").allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("hardening at the HTTP edge", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    process.env.CSRF_PROTECTION = "false";
    process.env.RATE_LIMIT_MAX = "3";
    process.env.CORS_ORIGINS = "https://pos.example";
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
    delete process.env.CORS_ORIGINS;
    process.env.CSRF_PROTECTION = "true";
    process.env.RATE_LIMIT_MAX = "10000";
  });

  it("sets the hardening headers on every response", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers["permissions-policy"]).toContain("geolocation=()");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("omits HSTS outside production", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["strict-transport-security"]).toBeUndefined();
  });

  it("answers 429 RATE_LIMITED once the budget is exhausted", async () => {
    const first = await app.inject({ method: "GET", url: "/api/v1/products" });
    expect(first.statusCode).not.toBe(429);
    expect(first.headers["x-ratelimit-limit"]).toBe("3");

    let last = first;
    for (let i = 0; i < 4; i += 1) {
      last = await app.inject({ method: "GET", url: "/api/v1/products" });
    }

    expect(last.statusCode).toBe(429);
    expect(last.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests" },
    });
    expect(last.headers["retry-after"]).toBeDefined();
    expect(last.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("never rate-limits /health", async () => {
    for (let i = 0; i < 6; i += 1) {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    }
  });

  it("echoes only allowlisted CORS origins", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/api/v1/products",
      headers: { origin: "https://pos.example" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://pos.example");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const rejected = await app.inject({
      method: "GET",
      url: "/api/v1/products",
      headers: { origin: "https://evil.example" },
    });
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("CSRF double-submit protection", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    process.env.CSRF_PROTECTION = "true";
    process.env.RATE_LIMIT_MAX = "10000";
    delete process.env.CORS_ORIGINS;
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
    process.env.CSRF_PROTECTION = "true";
  });

  const session = "irrelevant-token";
  const csrf = "a".repeat(64);

  it("blocks a cookie-authenticated write without the header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/categories",
      headers: { cookie: `pos_session=${session}; pos_csrf=${csrf}` },
      payload: { name: "Attack" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(response.json().error.message).toContain("CSRF");
  });

  it("blocks a mismatched token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/categories",
      headers: {
        cookie: `pos_session=${session}; pos_csrf=${csrf}`,
        "x-csrf-token": "b".repeat(64),
      },
      payload: { name: "Attack" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("blocks a session without a CSRF cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/categories",
      headers: { cookie: `pos_session=${session}`, "x-csrf-token": csrf },
      payload: { name: "Attack" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("never blocks safe methods", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/categories",
      headers: { cookie: `pos_session=${session}; pos_csrf=${csrf}` },
    });

    expect(response.statusCode).not.toBe(403);
  });

  it("rejects an unauthenticated write with 401, not 403", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/categories",
      payload: { name: "Anonymous" },
    });

    expect(response.statusCode).toBe(401);
  });
});
