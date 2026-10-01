import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  AuthNotConfiguredError,
  UnauthorizedError,
} from "../../domain/errors/domain-error.js";
import { RemoteOidcProvider, type OidcConfig } from "./oidc-provider.js";

const ISSUER = "https://idp.test";
const CLIENT_ID = "pos-client";
const REDIRECT_URI = "http://localhost:3000/api/v1/auth/callback";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;

const config: OidcConfig = {
  issuer: `${ISSUER}/`,
  clientId: CLIENT_ID,
  clientSecret: "s3cret",
};

const discovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
};

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const { privateKey: foreignKey } = await generateKeyPair("RS256", {
  extractable: true,
});

const jwks = {
  keys: [
    { ...(await exportJWK(publicKey)), kid: "unit-key", alg: "RS256", use: "sig" },
  ],
};

const exchangeParams = {
  code: "auth-code",
  redirectUri: REDIRECT_URI,
  codeVerifier: "verifier",
  expectedNonce: "nonce-1",
};

const authorizationRequest = {
  redirectUri: REDIRECT_URI,
  state: "state-1",
  nonce: "nonce-1",
  codeChallenge: "challenge-1",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchStub {
  calls: string[];
  routes: Record<string, () => Response>;
}

function stubFetch(routes: Record<string, () => Response>): FetchStub {
  const stub: FetchStub = { calls: [], routes };
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = input instanceof Request ? input.url : String(input);
    stub.calls.push(url);
    const route = stub.routes[url];
    if (!route) return Promise.reject(new Error(`unexpected fetch to ${url}`));
    return Promise.resolve().then(route);
  });
  return stub;
}

function tokenFlowRoutes(idToken: () => Response): Record<string, () => Response> {
  return {
    [DISCOVERY_URL]: () => jsonResponse(discovery),
    [discovery.token_endpoint]: idToken,
    [discovery.jwks_uri]: () => jsonResponse(jwks),
  };
}

async function signIdToken(
  claims: { nonce?: string; email?: unknown; name?: unknown },
  options: { expired?: boolean; signingKey?: CryptoKey; issuer?: string } = {},
): Promise<string> {
  const payload: Record<string, unknown> = {};
  if (claims.nonce !== undefined) payload.nonce = claims.nonce;
  if (claims.email !== undefined) payload.email = claims.email;
  if (claims.name !== undefined) payload.name = claims.name;

  const expiration = options.expired
    ? new Date(Date.now() - 60_000)
    : new Date(Date.now() + 300_000);

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "unit-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(options.signingKey ?? privateKey);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RemoteOidcProvider", () => {
  it("fails closed when unconfigured", async () => {
    const provider = new RemoteOidcProvider(null);

    await expect(
      provider.authorizationUrl(authorizationRequest),
    ).rejects.toBeInstanceOf(AuthNotConfiguredError);
    await expect(provider.exchangeCode(exchangeParams)).rejects.toBeInstanceOf(
      AuthNotConfiguredError,
    );
  });

  it("builds the authorization URL with every OAuth parameter", async () => {
    const stub = stubFetch({ [DISCOVERY_URL]: () => jsonResponse(discovery) });
    const provider = new RemoteOidcProvider(config);

    const url = await provider.authorizationUrl(authorizationRequest);

    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      response_type: "code",
      scope: "openid email profile",
      redirect_uri: REDIRECT_URI,
      state: "state-1",
      nonce: "nonce-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
    });
    expect(stub.calls).toEqual([DISCOVERY_URL]);
  });

  it("fetches the discovery document once and reuses it", async () => {
    const stub = stubFetch({ [DISCOVERY_URL]: () => jsonResponse(discovery) });
    const provider = new RemoteOidcProvider(config);

    await provider.authorizationUrl(authorizationRequest);
    await provider.authorizationUrl(authorizationRequest);

    expect(stub.calls.filter((call) => call === DISCOVERY_URL)).toHaveLength(1);
  });

  it("exchanges a code for the identity", async () => {
    const token = await signIdToken({
      nonce: "nonce-1",
      email: "ana@acme.test",
      name: "Ana",
    });
    const stub = stubFetch(tokenFlowRoutes(() => jsonResponse({ id_token: token })));
    const provider = new RemoteOidcProvider(config);

    const identity = await provider.exchangeCode(exchangeParams);

    expect(identity).toEqual({ email: "ana@acme.test", name: "Ana" });
    expect(stub.calls).toContain(discovery.token_endpoint);
  });

  it("returns a null name when the token carries none", async () => {
    const token = await signIdToken({ nonce: "nonce-1", email: "ana@acme.test" });
    stubFetch(tokenFlowRoutes(() => jsonResponse({ id_token: token })));
    const provider = new RemoteOidcProvider(config);

    const identity = await provider.exchangeCode(exchangeParams);

    expect(identity).toEqual({ email: "ana@acme.test", name: null });
  });

  it("coerces a non-string email claim to an empty identity", async () => {
    const token = await signIdToken({ nonce: "nonce-1", email: 42 });
    stubFetch(tokenFlowRoutes(() => jsonResponse({ id_token: token })));
    const provider = new RemoteOidcProvider(config);

    const identity = await provider.exchangeCode(exchangeParams);

    expect(identity).toEqual({ email: "", name: null });
  });

  it("rejects a code the provider refuses", async () => {
    stubFetch(tokenFlowRoutes(() => jsonResponse({ error: "invalid_grant" }, 400)));
    const provider = new RemoteOidcProvider(config);

    const attempt = provider.exchangeCode(exchangeParams);
    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt).rejects.toThrow(
      "Identity provider rejected the authorization code",
    );
  });

  it("rejects a token response without an ID token", async () => {
    stubFetch(tokenFlowRoutes(() => jsonResponse({})));
    const provider = new RemoteOidcProvider(config);

    const attempt = provider.exchangeCode(exchangeParams);
    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt).rejects.toThrow(
      "Identity provider did not return an ID token",
    );
  });

  it("rejects an ID token signed by a foreign key", async () => {
    const token = await signIdToken(
      { nonce: "nonce-1", email: "ana@acme.test" },
      { signingKey: foreignKey },
    );
    stubFetch(tokenFlowRoutes(() => jsonResponse({ id_token: token })));
    const provider = new RemoteOidcProvider(config);

    const attempt = provider.exchangeCode(exchangeParams);
    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt).rejects.toThrow(
      "Identity provider returned an invalid ID token",
    );
  });

  it("rejects an expired ID token", async () => {
    const token = await signIdToken(
      { nonce: "nonce-1", email: "ana@acme.test" },
      { expired: true },
    );
    stubFetch(tokenFlowRoutes(() => jsonResponse({ id_token: token })));
    const provider = new RemoteOidcProvider(config);

    await expect(provider.exchangeCode(exchangeParams)).rejects.toThrow(
      "Identity provider returned an invalid ID token",
    );
  });

  it("rejects a nonce replay", async () => {
    const token = await signIdToken({ nonce: "other", email: "ana@acme.test" });
    stubFetch(tokenFlowRoutes(() => jsonResponse({ id_token: token })));
    const provider = new RemoteOidcProvider(config);

    const attempt = provider.exchangeCode(exchangeParams);
    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(attempt).rejects.toThrow(
      "Identity provider returned an unexpected nonce",
    );
  });

  describe("discovery failures", () => {
    it("surfaces HTTP errors", async () => {
      stubFetch({ [DISCOVERY_URL]: () => jsonResponse({}, 500) });
      const provider = new RemoteOidcProvider(config);

      await expect(provider.authorizationUrl(authorizationRequest)).rejects.toThrow(
        "OIDC discovery failed with status 500",
      );
    });

    it("rejects an incomplete document", async () => {
      stubFetch({ [DISCOVERY_URL]: () => jsonResponse({ issuer: ISSUER }) });
      const provider = new RemoteOidcProvider(config);

      await expect(provider.authorizationUrl(authorizationRequest)).rejects.toThrow(
        "OIDC discovery document is invalid",
      );
    });

    it("rejects a document whose issuer does not match", async () => {
      stubFetch({
        [DISCOVERY_URL]: () =>
          jsonResponse({ ...discovery, issuer: "https://evil.test" }),
      });
      const provider = new RemoteOidcProvider(config);

      await expect(provider.authorizationUrl(authorizationRequest)).rejects.toThrow(
        "OIDC discovery issuer does not match configuration",
      );
    });

    it("retries after a network failure", async () => {
      let attempts = 0;
      const stub = stubFetch({
        [DISCOVERY_URL]: () => {
          attempts += 1;
          if (attempts === 1) throw new Error("socket hang up");
          return jsonResponse(discovery);
        },
      });
      const provider = new RemoteOidcProvider(config);

      await expect(provider.authorizationUrl(authorizationRequest)).rejects.toThrow(
        "socket hang up",
      );

      const url = await provider.authorizationUrl(authorizationRequest);

      expect(url.pathname).toBe("/authorize");
      expect(stub.calls.filter((call) => call === DISCOVERY_URL)).toHaveLength(2);
    });
  });
});
