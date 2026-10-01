import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { startStubIdp, type StubIdP } from "../helpers/stub-idp.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLIENT_ID = "pos-test";

type HeaderValue = string | string[] | number | undefined;

interface HeaderCarrier {
  headers: Record<string, HeaderValue>;
}

function setCookiesOf(response: HeaderCarrier): string[] {
  const raw = response.headers["set-cookie"];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw;
  return [];
}

function cookieValue(cookies: string[], name: string): string | undefined {
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator) === name) {
      return pair.slice(separator + 1);
    }
  }
  return undefined;
}

interface LoginJourney {
  response: HeaderCarrier;
  location: URL;
  pendingCookie: string;
}

describe("auth HTTP API", () => {
  let idp: StubIdP;
  let app: FastifyInstance;
  let openApp: FastifyInstance;

  beforeAll(async () => {
    idp = await startStubIdp(CLIENT_ID);
    app = await buildApp(
      loadEnv({
        NODE_ENV: "test",
        PORT: "3000",
        LOG_LEVEL: "silent",
        DATABASE_URL: "file::memory:",
        OAUTH_ISSUER: idp.baseUrl,
        OAUTH_CLIENT_ID: CLIENT_ID,
        OAUTH_CLIENT_SECRET: "test-secret",
        COOKIE_SECRET: "s".repeat(48),
      }),
    );
    openApp = await buildApp(
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
    await openApp.close();
    await idp.close();
  });

  async function startLogin(target: FastifyInstance = app): Promise<LoginJourney> {
    const response = await target.inject({
      method: "GET",
      url: "/api/v1/auth/login",
    });
    expect(response.statusCode).toBe(302);

    const location = new URL(String(response.headers.location));
    const pendingCookie = cookieValue(setCookiesOf(response), "pos_oauth");
    expect(pendingCookie).toBeDefined();
    return { response, location, pendingCookie: pendingCookie! };
  }

  async function completeLogin(
    overrides: { code?: string; state?: string; nonce?: string; email?: string } = {},
  ) {
    const journey = await startLogin();
    const state = overrides.state ?? journey.location.searchParams.get("state")!;
    idp.token.nonce = overrides.nonce ?? journey.location.searchParams.get("nonce")!;
    idp.token.email = overrides.email ?? "ada@example.com";

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/auth/callback?code=${overrides.code ?? "valid-code"}&state=${state}`,
      headers: { cookie: `pos_oauth=${journey.pendingCookie}` },
    });
    return {
      response,
      location: journey.location,
      pendingCookie: journey.pendingCookie,
    };
  }

  async function meWith(session: string | null, target: FastifyInstance = app) {
    return target.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: session ? { cookie: `pos_session=${session}` } : {},
    });
  }

  describe("GET /api/v1/auth/login", () => {
    it("redirects with state, nonce and PKCE, binding them in a cookie", async () => {
      const { response, location, pendingCookie } = await startLogin();

      expect(location.origin).toBe(idp.baseUrl);
      expect(location.pathname).toBe("/authorize");
      expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(location.searchParams.get("response_type")).toBe("code");
      expect(location.searchParams.get("scope")).toBe("openid email profile");
      expect(location.searchParams.get("redirect_uri")).toContain(
        "/api/v1/auth/callback",
      );
      expect(location.searchParams.get("code_challenge_method")).toBe("S256");
      expect(location.searchParams.get("state")).toHaveLength(43);
      expect(location.searchParams.get("nonce")).toHaveLength(43);
      expect(location.searchParams.get("code_challenge")).toHaveLength(43);

      const cookie = setCookiesOf(response).find((c) => c.startsWith("pos_oauth="));
      expect(cookie).toBeDefined();
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Path=/api/v1/auth");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Max-Age=600");
      expect(pendingCookie.length).toBeGreaterThan(40);
    });

    it("returns 503 AUTH_NOT_CONFIGURED when auth is not configured", async () => {
      const response = await openApp.inject({
        method: "GET",
        url: "/api/v1/auth/login",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: "AUTH_NOT_CONFIGURED", message: expect.any(String) },
      });
    });
  });

  describe("GET /api/v1/auth/callback", () => {
    it("issues a session and resolves the provisioned user via /me", async () => {
      const { response, location } = await completeLogin();

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("/");

      const cookies = setCookiesOf(response);
      const session = cookieValue(cookies, "pos_session");
      expect(session).toBeDefined();
      const cleared = cookies.find((c) => c.startsWith("pos_oauth="));
      expect(cleared).toContain("Max-Age=0");

      const me = await meWith(session!);
      expect(me.statusCode).toBe(200);
      const body = me.json();
      expect(body.id).toMatch(UUID_PATTERN);
      expect(body.email).toBe("ada@example.com");
      expect(body.name).toBe("Ada Lovelace");
      expect(body.role).toBe("CASHIER");
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(body.passwordHash).toBeUndefined();
      expect(body._links.self.href).toBe("/api/v1/auth/me");

      const verifier = idp.lastTokenRequest.code_verifier;
      if (!verifier) throw new Error("stub received no code_verifier");
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
        location.searchParams.get("code_challenge"),
      );
      expect(idp.lastTokenRequest.client_secret).toBe("test-secret");
    });

    it("keeps one account across repeated logins", async () => {
      const first = await completeLogin({ email: "repeat@example.com" });
      const firstSession = cookieValue(setCookiesOf(first.response), "pos_session")!;
      const firstId = (await meWith(firstSession)).json().id;

      const second = await completeLogin({ email: "repeat@example.com" });
      const secondSession = cookieValue(setCookiesOf(second.response), "pos_session")!;
      const secondId = (await meWith(secondSession)).json().id;

      expect(secondId).toBe(firstId);
    });

    it("rejects a state mismatch with 401", async () => {
      const journey = await startLogin();
      idp.token.nonce = journey.location.searchParams.get("nonce")!;

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/callback?code=valid-code&state=forged-state",
        headers: { cookie: `pos_oauth=${journey.pendingCookie}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a callback without the pending cookie with 401", async () => {
      const journey = await startLogin();

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/auth/callback?code=valid-code&state=${journey.location.searchParams.get("state")}`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a provider error response with 401", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/callback?error=access_denied",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects an invalid authorization code with 401", async () => {
      const response = await completeLogin({ code: "wrong-code" });

      expect(response.response.statusCode).toBe(401);
      expect(response.response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects an ID token with the wrong nonce with 401", async () => {
      const response = await completeLogin({ nonce: "not-the-login-nonce" });

      expect(response.response.statusCode).toBe(401);
      expect(response.response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a malformed callback with 400", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/callback",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns 401 without a session", async () => {
      const response = await meWith(null);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: expect.any(String) },
      });
    });

    it("returns 401 for a tampered session cookie", async () => {
      const journey = await completeLogin({ email: "tamper@example.com" });
      const session = cookieValue(setCookiesOf(journey.response), "pos_session")!;
      const tampered = `${session.slice(0, -1)}${session.endsWith("A") ? "B" : "A"}`;

      const response = await meWith(tampered);

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("UNAUTHORIZED");
    });

    it("returns 503 AUTH_NOT_CONFIGURED when auth is not configured", async () => {
      const response = await openApp.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("AUTH_NOT_CONFIGURED");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("expires the session cookie with 204", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      const cleared = setCookiesOf(response).find((c) => c.startsWith("pos_session="));
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("Path=/");
    });
  });
});
