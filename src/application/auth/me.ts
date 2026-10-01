import type { User } from "../../domain/entities/user.js";
import {
  AuthNotConfiguredError,
  UnauthorizedError,
} from "../../domain/errors/domain-error.js";
import type { UserRepository } from "../ports/user-repository.js";
import { verifySessionToken } from "./session.js";

/**
 * Resolves the current user from a session token. Fails closed with 401 for
 * missing/invalid/expired sessions and for sessions whose user no longer
 * exists (e.g. deleted account).
 */
export async function me(
  users: UserRepository,
  token: string | null,
  cookieSecret: string,
): Promise<User> {
  if (!cookieSecret) {
    throw new AuthNotConfiguredError();
  }
  if (!token) {
    throw new UnauthorizedError();
  }

  const session = verifySessionToken(token, cookieSecret);
  if (!session) {
    throw new UnauthorizedError("Invalid or expired session");
  }

  const user = await users.findById(session.sub);
  if (!user) {
    throw new UnauthorizedError("Session user no longer exists");
  }
  return user;
}
