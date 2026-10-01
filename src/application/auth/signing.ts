import { createHmac, timingSafeEqual } from "node:crypto";
import { type z } from "zod";

/**
 * Minimal signed-token primitive for stateless cookies: the payload stays
 * readable (no encryption needed — it is not secret from its owner) but any
 * tampering fails verification. Format: `base64url(json).base64url(hmac)`.
 */
function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

/**
 * Verifies a signed token against `secret` (timing-safe comparison) and
 * validates its shape. Returns null for anything invalid — callers must
 * fail closed rather than guess.
 */
export function unsign<S extends z.ZodType>(
  token: string,
  schema: S,
  secret: string,
): z.infer<S> | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(body, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const json: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
