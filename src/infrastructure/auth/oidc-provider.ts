import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import { z } from "zod";
import type {
  AuthorizationRequest,
  ExchangeCodeParams,
  OidcIdentity,
  OidcProvider,
} from "../../application/ports/oidc-provider.js";
import {
  AuthNotConfiguredError,
  UnauthorizedError,
} from "../../domain/errors/domain-error.js";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  audience?: string;
}

const discoverySchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});

type Discovery = z.infer<typeof discoverySchema>;

const tokenResponseSchema = z.object({ id_token: z.string().min(1) });

export class RemoteOidcProvider implements OidcProvider {
  private readonly config: OidcConfig | null;
  private discovery: Promise<Discovery> | null = null;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(config: OidcConfig | null) {
    this.config = config
      ? { ...config, issuer: config.issuer.replace(/\/+$/, "") }
      : null;
  }

  async authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    const config = this.requireConfig();
    const discovery = await this.discover();

    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("redirect_uri", request.redirectUri);
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
  }

  async exchangeCode(params: ExchangeCodeParams): Promise<OidcIdentity> {
    const config = this.requireConfig();
    const discovery = await this.discover();

    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: params.codeVerifier,
      }),
    });
    if (!response.ok) {
      throw new UnauthorizedError("Identity provider rejected the authorization code");
    }

    const token = tokenResponseSchema.safeParse(await response.json());
    if (!token.success) {
      throw new UnauthorizedError("Identity provider did not return an ID token");
    }

    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token.data.id_token, this.jwks, {
        issuer: config.issuer,
        audience: config.audience ?? config.clientId,
      }));
    } catch {
      throw new UnauthorizedError("Identity provider returned an invalid ID token");
    }

    if (payload.nonce !== params.expectedNonce) {
      throw new UnauthorizedError("Identity provider returned an unexpected nonce");
    }

    return {
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : null,
    };
  }

  private requireConfig(): OidcConfig {
    if (!this.config) {
      throw new AuthNotConfiguredError();
    }
    return this.config;
  }

  private discover(): Promise<Discovery> {
    if (!this.discovery) {
      const attempt = this.fetchDiscovery();
      this.discovery = attempt;
      void attempt.catch(() => {
        if (this.discovery === attempt) this.discovery = null;
      });
    }
    return this.discovery;
  }

  private async fetchDiscovery(): Promise<Discovery> {
    const config = this.requireConfig();
    const url = new URL(`${config.issuer}/.well-known/openid-configuration`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OIDC discovery failed with status ${response.status}`);
    }

    const document = discoverySchema.safeParse(await response.json());
    if (!document.success) {
      throw new Error("OIDC discovery document is invalid");
    }
    if (document.data.issuer.replace(/\/+$/, "") !== config.issuer) {
      throw new Error("OIDC discovery issuer does not match configuration");
    }
    return document.data;
  }
}
