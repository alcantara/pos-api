/** A role assignment. Stored as TEXT + CHECK on every supported engine. */
export type Role = "ADMIN" | "MANAGER" | "CASHIER";

/**
 * A person who can authenticate. `role` is authoritative in this database —
 * identity providers never supply it. `passwordHash` holds Argon2id hashes
 * for optional local credentials and stays null for OIDC-only accounts.
 * Timestamps are epoch milliseconds (UTC).
 */
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: Role;
  createdAt: number;
  updatedAt: number;
}
