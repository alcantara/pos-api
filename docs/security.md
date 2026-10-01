# Security

> Phase 0 specification. Implemented: OIDC login (PKCE, state, nonce,
> issuer/signature/expiration checks), stateless signed HttpOnly cookies,
> fail-closed configuration, sanitized error responses, parameterized queries,
> `requireRole` guards on every resource route. Pending: rate limiting, CORS,
> security headers, audit log (Phase 10).

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

| Operation                      | ADMIN | MANAGER | CASHIER |
| ------------------------------ | ----- | ------- | ------- |
| Read collections and items     | yes   | yes     | yes     |
| Create, update, delete records | yes   | yes     | no      |

A missing or invalid session answers 401 `UNAUTHORIZED`; an authenticated user
without the required role answers 403 `FORBIDDEN`. Without `COOKIE_SECRET` the
guard fails closed with 503 `AUTH_NOT_CONFIGURED`.

`pnpm db:seed` creates one user per role — `admin@pos.local`, `manager@pos.local`
and `cashier@pos.local`, with `passwordHash` null. Users arriving through OIDC
are created as CASHIER; seeding by email is how an account is promoted, and the
seed never overwrites a role changed afterwards.

## Hard controls

- Argon2id for local password hashing (if local credentials are needed)
- Rate limiting on all public endpoints
- CORS configured explicitly
- Security headers (HSTS, CSP, X-Content-Type-Options, etc.)
- Request body and parameter limits
- Secure cookies, HttpOnly where applicable
- CSRF protection where applicable
- Session expiration
- Sanitized errors in production — no stack traces, SQL errors, or paths
- Audit log for sensitive operations

## Secrets

- `DATABASE_URL` and any OAuth credentials via environment variables
- Never commit secrets; never bake secrets into Docker images
- Never log passwords, tokens, or hashes

## Threat model

- SQL injection — prevented by Drizzle parameterized queries; never concatenate user input
- Privilege escalation — tested via authz tests for each role boundary
- Duplicate requests — idempotency keys on POST /sales
- Negative inventory — database-level concurrency controls
