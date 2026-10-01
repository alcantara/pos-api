import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { User } from "../../domain/entities/user.js";
import {
  AuthNotConfiguredError,
  UnauthorizedError,
} from "../../domain/errors/domain-error.js";
import type {
  AuthorizationRequest,
  ExchangeCodeParams,
  OidcIdentity,
  OidcProvider,
} from "../ports/oidc-provider.js";
import type { UserRepository } from "../ports/user-repository.js";
import { callback } from "./callback.js";
import {
  createLoginState,
  LOGIN_STATE_TTL_SECONDS,
  verifyLoginState,
} from "./login-state.js";
import { login } from "./login.js";
import { me } from "./me.js";
import {
  createSessionToken,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from "./session.js";

const SECRET = "x".repeat(48);
const OTHER_SECRET = "y".repeat(48);
const REDIRECT_URI = "https://api.test/api/v1/auth/callback";

class FakeOidcProvider implements OidcProvider {
  lastRequest: AuthorizationRequest | null = null;
  lastExchange: ExchangeCodeParams | null = null;
  identity: OidcIdentity = { email: "ana@example.com", name: "Ana Silva" };
  exchangeError: Error | null = null;

  authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    this.lastRequest = request;
    return Promise.resolve(new URL("https://idp.test/authorize"));
  }

  exchangeCode(params: ExchangeCodeParams): Promise<OidcIdentity> {
    this.lastExchange = params;
    if (this.exchangeError) return Promise.reject(this.exchangeError);
    return Promise.resolve(this.identity);
  }
}

class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, User>();

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    for (const row of this.rows.values()) {
      if (row.email === email) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  insert(user: User): Promise<void> {
    this.rows.set(user.id, user);
    return Promise.resolve();
  }

  update(user: User): Promise<void> {
    this.rows.set(user.id, user);
    return Promise.resolve();
  }
}

/** Starts a login and returns its pending cookie plus the provider request. */
async function startLogin(provider: FakeOidcProvider) {
  const outcome = await login(provider, {
    cookieSecret: SECRET,
    redirectUri: REDIRECT_URI,
  });
  return { cookie: outcome.cookie.value, request: provider.lastRequest! };
}

function makeUser(overrides: Partial<User> = {}): User {
  const now = Date.now();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "existing@example.com",
    name: "Existing",
    passwordHash: null,
    role: "ADMIN",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("session tokens", () => {
  it("round-trips a user id", () => {
    const token = createSessionToken("11111111-1111-4111-8111-111111111111", SECRET);
    const payload = verifySessionToken(token, SECRET);

    expect(payload?.sub).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered token", () => {
    const token = createSessionToken("11111111-1111-4111-8111-111111111111", SECRET);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    expect(verifySessionToken(tampered, SECRET)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken(
      "11111111-1111-4111-8111-111111111111",
      OTHER_SECRET,
    );

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - (SESSION_TTL_SECONDS + 60) * 1000;
    const token = createSessionToken(
      "11111111-1111-4111-8111-111111111111",
      SECRET,
      past,
    );

    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
  });
});

describe("login state", () => {
  it("round-trips state, nonce and the PKCE verifier", () => {
    const pending = createLoginState(SECRET);
    const state = verifyLoginState(pending.cookie, SECRET);

    expect(state).not.toBeNull();
    expect(state!.state).toBe(pending.state);
    expect(state!.nonce).toBe(pending.nonce);
    expect(state!.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The challenge sent to the provider must be S256 of the stored verifier.
    const recomputed = createHash("sha256").update(state!.verifier).digest("base64url");
    expect(pending.codeChallenge).toBe(recomputed);
  });

  it("rejects tampered, expired or foreign cookies", () => {
    const pending = createLoginState(SECRET);
    const expired = createLoginState(
      SECRET,
      Date.now() - (LOGIN_STATE_TTL_SECONDS + 60) * 1000,
    );

    expect(verifyLoginState(`${pending.cookie}x`, SECRET)).toBeNull();
    expect(verifyLoginState(expired.cookie, SECRET)).toBeNull();
    expect(verifyLoginState(pending.cookie, OTHER_SECRET)).toBeNull();
  });
});

describe("login", () => {
  it("produces a redirect target and a verifiable pending cookie", async () => {
    const provider = new FakeOidcProvider();
    const { cookie, request } = await startLogin(provider);

    expect(request.redirectUri).toBe(REDIRECT_URI);
    expect(request.state).toHaveLength(43);
    expect(request.nonce).toHaveLength(43);
    expect(request.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyLoginState(cookie, SECRET)?.state).toBe(request.state);
  });

  it("fails closed when the cookie secret is missing", async () => {
    const provider = new FakeOidcProvider();

    await expect(
      login(provider, { cookieSecret: "", redirectUri: REDIRECT_URI }),
    ).rejects.toBeInstanceOf(AuthNotConfiguredError);
  });
});

describe("callback", () => {
  async function exchange(overrides: Partial<Parameters<typeof callback>[2]> = {}) {
    const provider = new FakeOidcProvider();
    const users = new InMemoryUserRepository();
    const { cookie, request } = await startLogin(provider);

    const outcome = await callback(provider, users, {
      code: "auth-code",
      state: request.state,
      stateCookie: cookie,
      redirectUri: REDIRECT_URI,
      cookieSecret: SECRET,
      ...overrides,
    });
    return { provider, users, outcome };
  }

  it("provisions a new user with the least privileged role", async () => {
    const { provider, users, outcome } = await exchange();

    expect(outcome.user.role).toBe("CASHIER");
    expect(outcome.user.passwordHash).toBeNull();
    expect(outcome.user.email).toBe("ana@example.com");
    expect(await users.findById(outcome.user.id)).toEqual(outcome.user);

    const session = verifySessionToken(outcome.sessionToken, SECRET);
    expect(session?.sub).toBe(outcome.user.id);
    expect(outcome.sessionMaxAge).toBeGreaterThan(0);

    // The PKCE verifier and nonce travel to the provider, not the client.
    expect(provider.lastExchange?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(provider.lastExchange?.expectedNonce).toBe(provider.lastRequest?.nonce);
    expect(provider.lastExchange?.redirectUri).toBe(REDIRECT_URI);
  });

  it("keeps the local role and refreshes a changed name", async () => {
    const provider = new FakeOidcProvider();
    const users = new InMemoryUserRepository();
    const existing = makeUser({ email: "ana@example.com", name: "Old Name" });
    await users.insert(existing);

    const { cookie, request } = await startLogin(provider);
    const outcome = await callback(provider, users, {
      code: "auth-code",
      state: request.state,
      stateCookie: cookie,
      redirectUri: REDIRECT_URI,
      cookieSecret: SECRET,
    });

    expect(outcome.user.id).toBe(existing.id);
    expect(outcome.user.role).toBe("ADMIN");
    expect(outcome.user.name).toBe("Ana Silva");
    await expect(users.findByEmail("ana@example.com")).resolves.toMatchObject({
      name: "Ana Silva",
    });
  });

  it("leaves the stored name untouched when the IdP sends none", async () => {
    const provider = new FakeOidcProvider();
    provider.identity = { email: "ana@example.com", name: null };
    const users = new InMemoryUserRepository();
    await users.insert(makeUser({ email: "ana@example.com", name: "Keep Me" }));

    const { cookie, request } = await startLogin(provider);
    const outcome = await callback(provider, users, {
      code: "auth-code",
      state: request.state,
      stateCookie: cookie,
      redirectUri: REDIRECT_URI,
      cookieSecret: SECRET,
    });

    expect(outcome.user.name).toBe("Keep Me");
  });

  it("rejects a state mismatch", async () => {
    const provider = new FakeOidcProvider();
    const { cookie } = await startLogin(provider);

    await expect(
      callback(provider, new InMemoryUserRepository(), {
        code: "auth-code",
        state: "forged-state",
        stateCookie: cookie,
        redirectUri: REDIRECT_URI,
        cookieSecret: SECRET,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a missing or expired pending cookie", async () => {
    const provider = new FakeOidcProvider();
    const users = new InMemoryUserRepository();
    const expired = createLoginState(
      SECRET,
      Date.now() - (LOGIN_STATE_TTL_SECONDS + 60) * 1000,
    );

    await expect(
      callback(provider, users, {
        code: "auth-code",
        state: "any",
        stateCookie: null,
        redirectUri: REDIRECT_URI,
        cookieSecret: SECRET,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await expect(
      callback(provider, users, {
        code: "auth-code",
        state: expired.state,
        stateCookie: expired.cookie,
        redirectUri: REDIRECT_URI,
        cookieSecret: SECRET,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("propagates provider failures", async () => {
    const provider = new FakeOidcProvider();
    provider.exchangeError = new UnauthorizedError("Token exchange failed");
    const { cookie, request } = await startLogin(provider);

    await expect(
      callback(provider, new InMemoryUserRepository(), {
        code: "auth-code",
        state: request.state,
        stateCookie: cookie,
        redirectUri: REDIRECT_URI,
        cookieSecret: SECRET,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a non-email identity", async () => {
    const provider = new FakeOidcProvider();
    provider.identity = { email: "not-an-email", name: null };
    const { cookie, request } = await startLogin(provider);

    await expect(
      callback(provider, new InMemoryUserRepository(), {
        code: "auth-code",
        state: request.state,
        stateCookie: cookie,
        redirectUri: REDIRECT_URI,
        cookieSecret: SECRET,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fails closed without a cookie secret", async () => {
    const provider = new FakeOidcProvider();

    await expect(
      callback(provider, new InMemoryUserRepository(), {
        code: "auth-code",
        state: "any",
        stateCookie: null,
        redirectUri: REDIRECT_URI,
        cookieSecret: "",
      }),
    ).rejects.toBeInstanceOf(AuthNotConfiguredError);
  });
});

describe("me", () => {
  it("resolves the session user", async () => {
    const users = new InMemoryUserRepository();
    const user = makeUser();
    await users.insert(user);
    const token = createSessionToken(user.id, SECRET);

    expect(await me(users, token, SECRET)).toEqual(user);
  });

  it("rejects a missing, tampered or expired token", async () => {
    const users = new InMemoryUserRepository();
    await users.insert(makeUser());

    await expect(me(users, null, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(me(users, "junk", SECRET)).rejects.toBeInstanceOf(UnauthorizedError);

    const stale = createSessionToken(
      "11111111-1111-4111-8111-111111111111",
      SECRET,
      Date.now() - 9 * 60 * 60 * 1000,
    );
    await expect(me(users, stale, SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a session whose user no longer exists", async () => {
    const token = createSessionToken("22222222-2222-4222-8222-222222222222", SECRET);

    await expect(
      me(new InMemoryUserRepository(), token, SECRET),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("fails closed without a cookie secret", async () => {
    await expect(
      me(new InMemoryUserRepository(), "any-token", ""),
    ).rejects.toBeInstanceOf(AuthNotConfiguredError);
  });
});
