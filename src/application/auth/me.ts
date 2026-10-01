import type { User } from "../../domain/entities/user.js";
import {
  AuthNotConfiguredError,
  UnauthorizedError,
} from "../../domain/errors/domain-error.js";
import type { UserRepository } from "../ports/user-repository.js";
import { verifySessionToken } from "./session.js";

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
