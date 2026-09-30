# Development

## Setup

```bash
pnpm install
cp .env.example .env   # fill DATABASE_URL and OAuth credentials
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` or `postgresql://...` |
| OAuth credentials | Provider client ID/secret, issuer URL, audience |

## Running

- `pnpm dev` — local dev with hot reload
- `pnpm build && pnpm start` — production build
- `pnpm test` — Vitest (unit + integration)
- `pnpm lint` / `pnpm typecheck` — code quality

## Testing

Three levels via Vitest:
- Unit — domain rules, use cases, calculations, RBAC
- Integration — repositories, Drizzle, migrations, constraints (SQLite + PostgreSQL)
- E2E — real HTTP behavior via Fastify inject

## Git hooks

Husky + lint-staged:
- pre-commit → lint-staged
- pre-push → typecheck + tests

## Docker

```bash
docker compose up --build
```

Multi-stage build, non-root user, no secrets baked in.

## CI/CD

GitHub Actions runs: install, lint, typecheck, unit tests, integration tests
(SQLite + PostgreSQL matrix), build, security/dependency checks, Docker build,
deploy.
