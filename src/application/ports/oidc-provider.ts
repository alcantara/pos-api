export interface AuthorizationRequest {
  redirectUri: string;
  state: string;
  nonce: string;
  /** base64url(SHA-256(codeVerifier)) for PKCE (S256). */
  codeChallenge: string;
}

/**
 * Identity proven by a verified ID token: signature, issuer, audience,
 * expiration and nonce were all checked by the provider implementation
 * before this was returned. `role` is deliberately absent — roles are
 * authoritative in the local database, never supplied by an IdP.
 */
export interface OidcIdentity {
  email: string;
  name: string | null;
}

export interface ExchangeCodeParams {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  expectedNonce: string;
}

export interface OidcProvider {
  /** Absolute authorization endpoint URL including state/nonce/PKCE params. */
  authorizationUrl(request: AuthorizationRequest): Promise<URL>;
  /**
   * Exchanges the authorization code, then validates the ID token
   * (signature, issuer, audience, expiration, nonce). Protocol failures
   * throw `UnauthorizedError`; missing configuration throws
   * `AuthNotConfiguredError`.
   */
  exchangeCode(params: ExchangeCodeParams): Promise<OidcIdentity>;
}
