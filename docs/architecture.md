# Architecture

## Style

Lightweight Clean Architecture / modular monolith. Dependency direction:

```
Domain (entities, errors, business rules)
  ↓
Application (use cases, ports)
  ↓
Interfaces / Infrastructure (HTTP, repositories, databases)
```

Domain and application code must not depend on Fastify, Drizzle, HTTP, or
database drivers. Infrastructure implements application ports.

## Modules

Each bounded context lives under `src/application/<module>/` with its own
use cases. Shared ports live in `src/application/ports/`.

Bounded contexts: products, categories, customers, sales, payments,
inventory, cash-register, reports, auth.

## Layers

- **Domain** — entities, value objects, domain errors, business rules
- **Application** — use cases, port interfaces, DTOs, validation schemas
- **Infrastructure** — Drizzle schema, migrations, repositories, auth providers, logging
- **Interfaces/HTTP** — Fastify controllers, routes, middleware, serializers, HATEOAS

## Money

All monetary values use integer minor units (cents). `R$19.99 → 1999`.
Never use JavaScript floating-point for money.

## API conventions

- Prefix: `/api/v1`
- Response shape: `{ data, _links, meta }` for collections; `{ data, _links }` for items
- Errors: `{ error: { code, message } }` with HTTP status codes
- Pagination: offset `?page=1&limit=20`, max 100
- Sorting: explicit allowlist only
