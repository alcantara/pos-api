# POS API — Point of Sale REST API

Production-quality REST API for a Point of Sale (POS) system, built with
**TypeScript, Fastify, Drizzle ORM, SQLite/PostgreSQL, Zod, and Vitest**.

## What it is

Greenfield portfolio project demonstrating professional backend engineering:
clean architecture, OAuth 2.0 / OpenID Connect authentication, role-based
authorization, transactional sales with inventory safety, dual-dialect database
support, and a three-tier test suite covering SQLite and PostgreSQL. It is
built phase by phase according to the roadmap below.

## Features

Implemented:

- Products, categories and customers — CRUD, search, sorting, pagination
- Transactional sales — server-priced lines, stock validation, atomic stock
  decrement, cancellation with stock restoration
- Idempotent sale creation — `Idempotency-Key` claimed inside the sale
  transaction, so retries and duplicate deliveries never charge twice
- Inventory adjustments and a movement ledger shared by sales and adjustments
- OAuth 2.0 / OIDC login flow (PKCE, state, nonce) with stateless signed sessions
- REST + HATEOAS, offset pagination (max 100), consistent error envelope
- SQLite and PostgreSQL selected through `DATABASE_URL`, identical behavior on both
- Zod input validation at the HTTP boundary, sanitized errors, `/health`
- Role-based authorization (ADMIN / MANAGER / CASHIER) via `requireRole` guards
- Hardening — rate limiting, security headers, explicit CORS allowlist, CSRF
- Structured logging (pino) with request IDs
- Docker, Docker Compose, GitHub Actions CI, three-tier Vitest suite (500+ tests)

Planned:

- Audit log for sensitive operations
- OpenAPI specification

## Tech stack

TypeScript · Node.js · Fastify · Drizzle ORM · SQLite · PostgreSQL · Zod · Vitest · pnpm · ESLint · Prettier · Husky · Docker · Docker Compose · GitHub Actions

## Quick links

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Database](docs/database.md)
- [Development](docs/development.md)
- [API](docs/api.md)

## Phases

Phase 0 (specs) → 1 tooling → 2 database → 3 products → 4 categories →
5 customers → 6 auth → 7 RBAC → 8 sales → 9 inventory → 10 hardening →
11 testing → 12 Docker → 13 CI → 14 CD → 15 documentation

## Future work

Payments (split/tax/discount), cash register sessions, and reporting/CSV
export are intentionally out of scope for the current specification.
