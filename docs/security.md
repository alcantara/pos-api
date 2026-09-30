# Security

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
`requireRole(...)` mechanism — never hidden inside repositories.

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
