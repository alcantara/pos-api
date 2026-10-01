import type { User } from "../../../domain/entities/user.js";
import { authLinks } from "../hateoas.js";

/**
 * HTTP representation of the authenticated user. `passwordHash` never
 * leaves the server; the role comes from the local database (authoritative),
 * not from the identity provider.
 */
export function userRepresentation(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: new Date(user.createdAt).toISOString(),
    updatedAt: new Date(user.updatedAt).toISOString(),
    _links: authLinks(),
  };
}
