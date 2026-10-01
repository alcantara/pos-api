import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { SESSION_COOKIE } from "./cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "x-csrf-token";

const SECURITY_HEADERS: ReadonlyArray<[string, string]> = [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "no-referrer"],
  ["cross-origin-opener-policy", "same-origin"],
  ["permissions-policy", "geolocation=(), microphone=(), camera=()"],
];

export function registerSecurityHeaders(
  app: FastifyInstance,
  options: { hsts: boolean },
): void {
  app.addHook("onRequest", async (_request, reply) => {
    for (const [header, value] of SECURITY_HEADERS) {
      reply.header(header, value);
    }
    reply.removeHeader("x-powered-by");
    if (options.hsts) {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
  });
}

export function registerCors(app: FastifyInstance, origins: string[] | null): void {
  const allowed = new Set(origins ?? []);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !allowed.has(origin)) return;

    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "Origin");
    reply.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    reply.header(
      "access-control-allow-headers",
      "content-type,authorization,x-csrf-token,idempotency-key",
    );
    reply.header("access-control-max-age", "600");
  });
}

function tokensMatch(expected: string, received: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(received, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Double-submit CSRF check for cookie-authenticated writes. The cookie holds a
 * random token and the client echoes it in `x-csrf-token`; a cross-site form
 * or image request can send the cookie but cannot read it to set the header.
 */
export function registerCsrfProtection(
  app: FastifyInstance,
  options: { cookieName: string; enabled: boolean },
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!options.enabled) return;
    if (SAFE_METHODS.has(request.method)) return;

    const cookies = parseCookieHeader(request.headers.cookie);

    const session = cookies[SESSION_COOKIE];
    if (typeof session !== "string" || session.length === 0) return;

    const token = cookies[options.cookieName];
    const header = request.headers[CSRF_HEADER];

    const headerValue = Array.isArray(header) ? header[0] : header;
    const present =
      typeof token === "string" &&
      token.length > 0 &&
      typeof headerValue === "string" &&
      headerValue.length > 0;

    if (!present || !tokensMatch(token, headerValue)) {
      await reply.code(403).send({
        error: {
          code: "FORBIDDEN",
          message: "Missing or invalid CSRF token",
        },
      });
    }
  });
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    if (!(name in cookies)) cookies[name] = pair.slice(separator + 1).trim();
  }
  return cookies;
}

export function csrfCookieOptions(isProduction: boolean): {
  path: string;
  secure: boolean;
  sameSite: "Lax";
} {
  return { path: "/", secure: isProduction, sameSite: "Lax" };
}
