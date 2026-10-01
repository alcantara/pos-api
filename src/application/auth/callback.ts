import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Role, User } from "../../domain/entities/user.js";
import {
  AuthNotConfiguredError,
  UnauthorizedError,
} from "../../domain/errors/domain-error.js";
import type { OidcProvider } from "../ports/oidc-provider.js";
import type { UserRepository } from "../ports/user-repository.js";
import { verifyLoginState } from "./login-state.js";
import { createSessionToken, SESSION_TTL_SECONDS } from "./session.js";

/** Accounts provisioned through OIDC start with the least privileged role. */
const DEFAULT_ROLE: Role = "CASHIER";

export interface CallbackInput {
  code: string;
  /** `state` returned by the provider in the callback query. */
  state: string;
  /** Raw value of the pending-login cookie (null when absent). */
  stateCookie: string | null;
  redirectUri: string;
  cookieSecret: string;
}

export interface CallbackOutcome {
  user: User;
  sessionToken: string;
  sessionMaxAge: number;
}

function statesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Completes the login: validates the pending-login cookie against the
 * returned `state`, exchanges the code through the provider (which verifies
 * the ID token), provisions or refreshes the local user, and issues a
 * session token. Roles are never taken from the identity provider.
 */
export async function callback(
  provider: OidcProvider,
  users: UserRepository,
  input: CallbackInput,
): Promise<CallbackOutcome> {
  if (!input.cookieSecret) {
    throw new AuthNotConfiguredError();
  }

  const pending = input.stateCookie
    ? verifyLoginState(input.stateCookie, input.cookieSecret)
    : null;
  if (!pending) {
    throw new UnauthorizedError("Login session is missing or expired");
  }
  if (!statesMatch(pending.state, input.state)) {
    throw new UnauthorizedError("Invalid login state");
  }

  const identity = await provider.exchangeCode({
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: pending.verifier,
    expectedNonce: pending.nonce,
  });

  const email = identity.email.trim();
  if (!z.email().safeParse(email).success) {
    throw new UnauthorizedError("The identity provider did not return a valid email");
  }

  const now = Date.now();
  const name = identity.name?.trim();

  let user = await users.findByEmail(email);
  if (!user) {
    user = {
      id: randomUUID(),
      email,
      name: name || email,
      passwordHash: null,
      role: DEFAULT_ROLE,
      createdAt: now,
      updatedAt: now,
    };
    await users.insert(user);
  } else if (name && name !== user.name) {
    user = { ...user, name, updatedAt: now };
    await users.update(user);
  }

  return {
    user,
    sessionToken: createSessionToken(user.id, input.cookieSecret, now),
    sessionMaxAge: SESSION_TTL_SECONDS,
  };
}
