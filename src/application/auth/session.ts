import { z } from "zod";
import { sign, unsign } from "./signing.js";

/** Session lifetime: eight hours. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const sessionSchema = z.object({
  sub: z.string().uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

export type SessionPayload = z.infer<typeof sessionSchema>;

/** Issues a signed session token bound to `userId`. */
export function createSessionToken(
  userId: string,
  secret: string,
  now = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  return sign({ sub: userId, iat, exp: iat + SESSION_TTL_SECONDS }, secret);
}

/** Returns null when the token is missing, tampered with or expired. */
export function verifySessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  const payload = unsign(token, sessionSchema, secret);
  if (!payload) return null;
  if (payload.exp <= Math.floor(now / 1000)) return null;
  return payload;
}
