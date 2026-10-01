import type { FastifyReply, FastifyRequest } from "fastify";
import { callback } from "../../../application/auth/callback.js";
import { login } from "../../../application/auth/login.js";
import { me } from "../../../application/auth/me.js";
import type { Dependencies } from "../../../application/dependencies.js";
import type { Env } from "../../../config/env.js";
import {
  UnauthorizedError,
  ValidationError,
} from "../../../domain/errors/domain-error.js";
import {
  clearCookie,
  PENDING_LOGIN_COOKIE,
  parseCookies,
  SESSION_COOKIE,
  serializeCookie,
} from "../cookies.js";
import { API_PREFIX } from "../hateoas.js";
import { userRepresentation } from "../mappers/user-mapper.js";
import { callbackQuerySchema } from "../schemas/auth-schemas.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface AuthController {
  login: Handler;
  callback: Handler;
  me: Handler;
  logout: Handler;
}

/**
 * Registered callback URL: configured when `OAUTH_REDIRECT_URI` is set,
 * otherwise derived from the request (development convenience — production
 * must configure it explicitly).
 */
function callbackUri(request: FastifyRequest, env: Env): string {
  if (env.OAUTH_REDIRECT_URI) return env.OAUTH_REDIRECT_URI;
  const host = request.headers.host ?? "localhost";
  return `${request.protocol}://${host}${API_PREFIX}/auth/callback`;
}

export function createAuthController(
  dependencies: Dependencies,
  env: Env,
): AuthController {
  const secure = env.NODE_ENV === "production";
  const cookieSecret = env.COOKIE_SECRET ?? "";

  return {
    login: async (request, reply) => {
      const outcome = await login(dependencies.oidc, {
        cookieSecret,
        redirectUri: callbackUri(request, env),
      });

      reply.header(
        "set-cookie",
        serializeCookie(PENDING_LOGIN_COOKIE, outcome.cookie.value, {
          path: `${API_PREFIX}/auth`,
          maxAge: outcome.cookie.maxAge,
          secure,
        }),
      );
      return reply
        .code(302)
        .header("location", outcome.authorizationUrl.toString())
        .send();
    },

    callback: async (request, reply) => {
      const query = callbackQuerySchema.parse(request.query);
      if (query.error !== undefined) {
        throw new UnauthorizedError("Identity provider denied the request");
      }
      if (!query.code || !query.state) {
        throw new ValidationError("Callback requires code and state");
      }

      const stateCookie =
        parseCookies(request.headers.cookie)[PENDING_LOGIN_COOKIE] ?? null;
      const outcome = await callback(dependencies.oidc, dependencies.users, {
        code: query.code,
        state: query.state,
        stateCookie,
        redirectUri: callbackUri(request, env),
        cookieSecret,
      });

      reply.header("set-cookie", [
        serializeCookie(SESSION_COOKIE, outcome.sessionToken, {
          path: "/",
          maxAge: outcome.sessionMaxAge,
          secure,
        }),
        clearCookie(PENDING_LOGIN_COOKIE, {
          path: `${API_PREFIX}/auth`,
          secure,
        }),
      ]);
      // Stateless sessions: the browser stores the cookie; logout just
      // expires it. Lifetime is bounded by the signed `exp` claim.
      return reply.code(302).header("location", "/").send();
    },

    me: async (request, reply) => {
      const token = parseCookies(request.headers.cookie)[SESSION_COOKIE] ?? null;
      const user = await me(dependencies.users, token, cookieSecret);
      return reply.code(200).send(userRepresentation(user));
    },

    logout: async (_request, reply) => {
      reply.header("set-cookie", clearCookie(SESSION_COOKIE, { path: "/", secure }));
      return reply.code(204).send();
    },
  };
}
