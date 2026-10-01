export interface AuthorizationRequest {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

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
  authorizationUrl(request: AuthorizationRequest): Promise<URL>;
  exchangeCode(params: ExchangeCodeParams): Promise<OidcIdentity>;
}
