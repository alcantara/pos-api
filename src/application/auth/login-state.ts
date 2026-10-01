import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sign, unsign } from "./signing.js";

/** How long a pending login may wait at the identity provider. */
export const LOGIN_STATE_TTL_SECONDS = 10 * 60;

const loginStateSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  verifier: z.string().min(1),
  exp: z.number().int(),
});

export type LoginState = z.infer<typeof loginStateSchema>;

export interface PendingLogin {
  /** Query parameter sent to the provider. */
  state: string;
  nonce: string;
  /** PKCE S256 challenge sent to the provider. */
  codeChallenge: string;
  /** Signed value for the short-lived login cookie. */
  cookie: string;
  maxAge: number;
}

/**
 * Generates the anti-forgery material for one authorization-code attempt:
 * `state` (CSRF), `nonce` (replay binding) and a PKCE verifier, all bound
 * together in a signed cookie that only this server can produce.
 */
export function createLoginState(secret: string, now = Date.now()): PendingLogin {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  const maxAge = LOGIN_STATE_TTL_SECONDS;
  const exp = Math.floor(now / 1000) + maxAge;

  return {
    state,
    nonce,
    codeChallenge,
    cookie: sign({ state, nonce, verifier, exp }, secret),
    maxAge,
  };
}

/** Returns null when the cookie is missing, tampered with or expired. */
export function verifyLoginState(
  cookie: string,
  secret: string,
  now = Date.now(),
): LoginState | null {
  const payload = unsign(cookie, loginStateSchema, secret);
  if (!payload) return null;
  if (payload.exp <= Math.floor(now / 1000)) return null;
  return payload;
}
