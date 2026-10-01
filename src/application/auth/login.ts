import { AuthNotConfiguredError } from "../../domain/errors/domain-error.js";
import type { OidcProvider } from "../ports/oidc-provider.js";
import { createLoginState } from "./login-state.js";

export interface LoginInput {
  cookieSecret: string;
  redirectUri: string;
}

export interface LoginOutcome {
  authorizationUrl: URL;
  cookie: { value: string; maxAge: number };
}

export async function login(
  provider: OidcProvider,
  input: LoginInput,
): Promise<LoginOutcome> {
  if (!input.cookieSecret) {
    throw new AuthNotConfiguredError();
  }

  const pending = createLoginState(input.cookieSecret);
  const authorizationUrl = await provider.authorizationUrl({
    redirectUri: input.redirectUri,
    state: pending.state,
    nonce: pending.nonce,
    codeChallenge: pending.codeChallenge,
  });

  return {
    authorizationUrl,
    cookie: { value: pending.cookie, maxAge: pending.maxAge },
  };
}
