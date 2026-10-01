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

| Variable                                  | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                            | `file:./dev.db` or `postgresql://...`                    |
| `TEST_POSTGRES_URL`                       | PostgreSQL target for integration tests (required in CI) |
| `COOKIE_SECRET`                           | Signs session and login-state cookies (min 32 chars)     |
| OAuth credentials                         | Provider client ID/secret, issuer URL, audience          |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Requests per window per IP (120 / 60000)                 |
| `CORS_ORIGINS`                            | Comma-separated allowlist; unset emits no CORS headers   |
| `CSRF_PROTECTION`                         | `true` \| `false` for the double-submit check (on)       |

## Running

- `pnpm dev` — local dev with hot reload
- `pnpm build && pnpm start` — production build
- `pnpm db:migrate` / `pnpm db:seed` — schema / deterministic users + catalog
- `pnpm test` — all tests
- `pnpm test:unit` / `pnpm test:integration` / `pnpm test:e2e` — per level
- `pnpm lint` / `pnpm typecheck` — code quality

## Docker

| Script                     | Effect                                                |
| -------------------------- | ----------------------------------------------------- |
| `pnpm docker:up`           | starts the PostgreSQL service and waits until healthy |
| `pnpm docker:down`         | stops the stack, keeping data                         |
| `pnpm docker:down:volumes` | stops the stack and **deletes** the database volume   |
| `pnpm docker:stack`        | builds the image and runs the API against PostgreSQL  |

`pnpm docker:up` probes for a free host port starting at 5432 (override with
`POSTGRES_HOST_PORT`). When 5432 is already taken by a local PostgreSQL it picks
the next free port and prints the matching `TEST_POSTGRES_URL`, so the command
works either way:

```
port 5432 is busy — using 5433 instead
set TEST_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5433/pos_test
```

`docker/postgres/init.sql` creates `pos_dev` and `pos_test` the first time the
volume is initialized, so both URLs documented in `.env.example` work. Init
scripts do not re-run on an existing volume — use `pnpm docker:down:volumes` to
recreate it.

To run the integration suite against that server, point `TEST_POSTGRES_URL` at
it (the Postgres target is skipped when the variable is unset):

```bash
TEST_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/pos_test \
  pnpm test:integration
```

`tests/global-setup.ts` migrates every shared target once before Vitest fans
out, so the suite is green on the first run against an empty database; each test
file then migrates a no-op.

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

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which publishes
the image to GitHub Container Registry as `ghcr.io/<owner>/<repo>:<tag>` plus
a `sha-<short>` tag, then starts the image and waits for `/health` as a smoke
test. The image steps of both workflows are unverified on this host: container
egress does not work here, so they are validated on the GitHub runner.
