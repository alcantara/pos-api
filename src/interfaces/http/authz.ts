import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import { me } from "../../application/auth/me.js";
import type { Dependencies } from "../../application/dependencies.js";
import type { Role } from "../../domain/entities/user.js";
import { ForbiddenError } from "../../domain/errors/domain-error.js";
import { parseCookies, SESSION_COOKIE } from "./cookies.js";

export type RoleGuard = (...roles: Role[]) => preHandlerHookHandler;

export function createRoleGuard(
  dependencies: Dependencies,
  cookieSecret: string,
): RoleGuard {
  return (...roles: Role[]) =>
    async (request: FastifyRequest) => {
      const token = parseCookies(request.headers.cookie)[SESSION_COOKIE] ?? null;
      const user = await me(dependencies.users, token, cookieSecret);

      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new ForbiddenError(`Role ${user.role} cannot perform this operation`);
      }
    };
}
