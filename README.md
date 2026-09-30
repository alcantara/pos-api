# PDV API — Point of Sale REST API

Production-quality REST API for a Brazilian Point of Sale (PDV/POS) system, built
with **TypeScript, Fastify, Drizzle ORM, SQLite/PostgreSQL, Zod, and Vitest**.

## What it is

Greenfield portfolio project demonstrating professional backend engineering:
clean architecture, OAuth 2.0 / OpenID Connect authentication, RBAC,
idempotent checkout, inventory concurrency safety, audit logging, and full test
coverage against both SQLite and PostgreSQL.

## Features

- Products, categories, customers, sales, payments, inventory
- OAuth 2.0 / OIDC login flow with role-based authorization (ADMIN / MANAGER / CASHIER)
- Atomic checkout with stock reservation, discounts, taxes, split payments, idempotency
- Cash register with sessions, deposits, withdrawals, reconciliation
- Reports, CSV import/export, HATEOAS links, offset pagination
- Audit log, request IDs, structured logging, health/readiness endpoints
- Rate limiting, security headers, CORS, SQL injection protection

## Tech stack

TypeScript · Node.js · Fastify · Drizzle ORM · SQLite · PostgreSQL · Zod · Vitest · pnpm · ESLint · Prettier · Husky · Docker · Docker Compose · GitHub Actions · OpenAPI

## Quick links

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)
- [Database](docs/database.md)
- [Development](docs/development.md)
- [API](docs/api.md) — to be written in Phase 17

## Phases

Phase 0 (specs) → 1 tooling → 2 database → 3 products → 4 categories →
5 customers → 6 auth → 7 RBAC → 8 sales → 9 inventory → 10 cancellation →
11 cash register → 12 reports → 13 hardening → 14 testing → 15 Docker → 16 CI/CD → 17 docs
