import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sign, unsign } from "./signing.js";

export const LOGIN_STATE_TTL_SECONDS = 10 * 60;

const loginStateSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  verifier: z.string().min(1),
  exp: z.number().int(),
});

export type LoginState = z.infer<typeof loginStateSchema>;

export interface PendingLogin {
  state: string;
  nonce: string;
  codeChallenge: string;
  cookie: string;
  maxAge: number;
}

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
