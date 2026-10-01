# Security

> Phase 0 specification. Implemented: OIDC login (PKCE, state, nonce,
> issuer/signature/expiration checks), stateless signed HttpOnly cookies,
> fail-closed configuration, sanitized error responses, parameterized queries,
> `requireRole` guards on every resource route, per-IP rate limiting, security
> headers, an explicit CORS allowlist and double-submit CSRF protection.
> Pending: audit log.

## Authentication

OAuth 2.0 / OpenID Connect. Login and callback endpoints validate:

- issuer
- audience
- signature
- expiration
- state
- nonce where applicable

Never trust identity or role information supplied directly by the client.

## Authorization

RBAC with three roles: ADMIN, MANAGER, CASHIER. Centralized via an explicit
`requireRole(...)` mechanism (`src/interfaces/http/authz.ts`) — never hidden
inside repositories. The guard resolves the `pos_session` cookie, reloads the
user on every request (so role changes and deletions apply immediately) and
then checks the role.

| Operation                                      | ADMIN | MANAGER | CASHIER |
| ---------------------------------------------- | ----- | ------- | ------- |
| Read collections and items                     | yes   | yes     | yes     |
| Create, update, delete products/customers/etc. | yes   | yes     | no      |
| Create a sale                                  | yes   | yes     | yes     |
| Cancel a sale                                  | yes   | yes     | no      |
| Adjust stock                                   | yes   | yes     | no      |

A missing or invalid session answers 401 `UNAUTHORIZED`; an authenticated user
without the required role answers 403 `FORBIDDEN`. Without `COOKIE_SECRET` the
guard fails closed with 503 `AUTH_NOT_CONFIGURED`. The user is reloaded on
every request, so a role change or deletion takes effect immediately.

`pnpm db:seed` creates one user per role — `admin@pos.local`, `manager@pos.local`
and `cashier@pos.local`, with `passwordHash` null. Users arriving through OIDC
are created as CASHIER; seeding by email is how an account is promoted, and the
seed never overwrites a role changed afterwards.

## Hard controls

- Argon2id for local password hashing (if local credentials are needed)
- Rate limiting on all public endpoints — `RATE_LIMIT_MAX` per window per IP,
  429 `RATE_LIMITED`; `/health` is exempt so probes keep working
- CORS configured explicitly — headers are emitted only for origins listed in
  `CORS_ORIGINS`
- Security headers — `nosniff`, `DENY`, `no-referrer`, `same-origin`,
  `permissions-policy`; HSTS in production only
- Request body and parameter limits — 1 MiB body cap, strict Zod schemas
- Secure cookies, HttpOnly where applicable — `Secure` in production
- CSRF protection where applicable — double-submit cookie (`pos_csrf`) echoed in
  `x-csrf-token`, compared with `timingSafeEqual`, enforced on writes that carry
  a session cookie
- Session expiration — 8 h, signed HMAC, no server-side session table
- Sanitized errors in production — no stack traces, SQL errors, or paths
- Audit log for sensitive operations

## Secrets

- `DATABASE_URL` and any OAuth credentials via environment variables
- Never commit secrets; never bake secrets into Docker images
- Never log passwords, tokens, or hashes

## Threat model

- SQL injection — prevented by Drizzle parameterized queries; never concatenate user input
- Privilege escalation — tested via authz tests for each role boundary
- Price tampering — sale lines are priced from the database inside the sale
  transaction; the API rejects client-supplied prices (strict schemas)
- Duplicate requests — `POST /sales` accepts an `Idempotency-Key`, claimed in the
  same transaction as the sale (unique index on `(user_id, key)`), so a retry or
  a duplicate delivery replays the original sale instead of charging twice
- Negative inventory — `SELECT … FOR UPDATE` on PostgreSQL, `BEGIN IMMEDIATE` on
  SQLite, plus `CHECK (stock_quantity >= 0)`; concurrent sales cannot oversell
