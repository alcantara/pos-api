# PDV API — Point of Sale REST API

Production-quality REST API for a Point of Sale (PDV/POS) system, built with
**TypeScript, Fastify, Drizzle ORM, SQLite/PostgreSQL, Zod, and Vitest**.

## What it is

Greenfield portfolio project demonstrating professional backend engineering:
clean architecture, OAuth 2.0 / OpenID Connect authentication, RBAC,
transactional sales, inventory concurrency safety, and test coverage against
both SQLite and PostgreSQL.

## Features

- Products, categories, customers, sales, inventory
- OAuth 2.0 / OIDC login flow with role-based authorization (ADMIN / MANAGER / CASHIER)
- Transactional sale creation with stock validation and inventory movements
- Sale cancellation with stock restoration
- REST + HATEOAS, offset pagination, filtering, sorting
- SQLite and PostgreSQL selected through `DATABASE_URL`
- Zod input validation, consistent error envelope, health/readiness endpoints
- Structured logging with request IDs, rate limiting, security headers, CORS
- Docker, Docker Compose, GitHub Actions, OpenAPI

## Tech stack

TypeScript · Node.js · Fastify · Drizzle ORM · SQLite · PostgreSQL · Zod · Vitest · pnpm · ESLint · Prettier · Husky · Docker · Docker Compose · GitHub Actions · OpenAPI

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
