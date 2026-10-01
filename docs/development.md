# Development

## Setup

```bash
pnpm install
cp .env.example .env   # fill DATABASE_URL and OAuth credentials
pnpm db:migrate
pnpm db:seed   # admin@pos.local, manager@pos.local, cashier@pos.local
pnpm dev
```

## Environment variables

| Variable            | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `DATABASE_URL`      | `file:./dev.db` or `postgresql://...`                    |
| `TEST_POSTGRES_URL` | PostgreSQL target for integration tests (required in CI) |
| `COOKIE_SECRET`     | Signs session and login-state cookies (min 32 chars)     |
| OAuth credentials   | Provider client ID/secret, issuer URL, audience          |

## Running

- `pnpm dev` — local dev with hot reload
- `pnpm build && pnpm start` — production build
- `pnpm test` — all tests
- `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e` — per level
- `pnpm lint` / `pnpm typecheck` — code quality

## Testing

Three levels via Vitest:

- Unit — domain rules, use cases, calculations, RBAC (`src/**/*.test.ts`)
- Integration — repositories, Drizzle, migrations, constraints, SQLite + PostgreSQL (`tests/integration/`)
- E2E — real HTTP behavior via Fastify inject (`tests/http/`)

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

GitHub Actions (`.github/workflows/ci.yml`) runs: install, format check,
lint, typecheck, unit tests, e2e tests, integration tests (SQLite +
PostgreSQL service), build, dependency audit, and a Docker image build.
Deployment (Phase 14) is not configured yet.
