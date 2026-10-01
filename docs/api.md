# API

Machine-readable contract: [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1) —
see the [reference guide](./openapi.md).

Base URL: `/api/v1`. All responses are JSON except redirects. Timestamps are
RFC 3339 (ISO 8601) strings derived from epoch-millisecond integers; money is
integer cents (`priceCents`, `totalCents`).

## Endpoint index

Base path `/api/v1`. "any" means any authenticated role (`CASHIER`, `MANAGER`,
`ADMIN`); "manage" means `ADMIN` or `MANAGER`. Full request/response shapes live
in [`openapi.yaml`](./openapi.yaml).

| #   | Method   | Path                     | Roles  | Success | Errors                       |
| --- | -------- | ------------------------ | ------ | ------- | ---------------------------- |
| 1   | `GET`    | `/auth/login`            | public | 302     | 503                          |
| 2   | `GET`    | `/auth/callback`         | public | 302     | 400, 401                     |
| 3   | `GET`    | `/auth/me`               | any    | 200     | 401, 503                     |
| 4   | `POST`   | `/auth/logout`           | any    | 204     | 401, 403                     |
| 5   | `GET`    | `/categories`            | any    | 200     | 401, 403, 429                |
| 6   | `POST`   | `/categories`            | manage | 201     | 400, 401, 403, 409, 429      |
| 7   | `GET`    | `/categories/{id}`       | any    | 200     | 401, 404                     |
| 8   | `PATCH`  | `/categories/{id}`       | manage | 200     | 400, 401, 403, 404, 409      |
| 9   | `DELETE` | `/categories/{id}`       | manage | 204     | 401, 403, 404                |
| 10  | `GET`    | `/products`              | any    | 200     | 401, 429                     |
| 11  | `POST`   | `/products`              | manage | 201     | 400, 401, 403, 409, 429      |
| 12  | `GET`    | `/products/{id}`         | any    | 200     | 401, 404                     |
| 13  | `PATCH`  | `/products/{id}`         | manage | 200     | 400, 401, 403, 404, 409      |
| 14  | `DELETE` | `/products/{id}`         | manage | 204     | 401, 403, 404, 409           |
| 15  | `GET`    | `/customers`             | any    | 200     | 401                          |
| 16  | `POST`   | `/customers`             | manage | 201     | 400, 401, 403, 409           |
| 17  | `GET`    | `/customers/{id}`        | any    | 200     | 401, 404                     |
| 18  | `PATCH`  | `/customers/{id}`        | manage | 200     | 400, 401, 403, 404, 409      |
| 19  | `DELETE` | `/customers/{id}`        | manage | 204     | 401, 403, 404, 409           |
| 20  | `GET`    | `/sales`                 | any    | 200     | 400, 401                     |
| 21  | `POST`   | `/sales`                 | any    | 201     | 400, 401, 403, 404, 409, 413 |
| 22  | `GET`    | `/sales/{id}`            | any    | 200     | 401, 404                     |
| 23  | `POST`   | `/sales/{id}/cancel`     | manage | 200     | 401, 403, 404, 409           |
| 24  | `GET`    | `/inventory/movements`   | any    | 200     | 400, 401                     |
| 25  | `POST`   | `/inventory/adjustments` | manage | 201     | 400, 401, 403, 404, 409      |

Two routes sit outside `/api/v1`:

| Method | Path      | Auth   | Purpose                                       |
| ------ | --------- | ------ | --------------------------------------------- |
| `GET`  | `/health` | public | liveness probe; exempt from rate limiting     |
| `GET`  | `/docs`   | public | Swagger UI (see [`openapi.md`](./openapi.md)) |

Every non-2xx response is one of the codes in the [error envelope](#error-envelope).
`POST /sales` also answers `200` when an idempotency key is replayed.

## Request conventions

Every request accepts `Accept: application/json`. Writes additionally need:

| Header            | When                                     | Failure             |
| ----------------- | ---------------------------------------- | ------------------- |
| `x-csrf-token`    | cookie-authenticated `POST/PATCH/DELETE` | 403                 |
| `idempotency-key` | optional on `POST /sales`                | 400 if malformed    |
| `content-type`    | requests with a body                     | 415 if absent/wrong |

Reads are plain `GET` with optional query parameters. IDs are UUIDs in path
segments and bodies.

## Error envelope

Every non-2xx response uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": [{ "path": "name", "message": "..." }]
  }
}
```

`details` is present only for validation failures. Server errors are sanitized
to `INTERNAL_ERROR` / `Internal server error`.

| Code                                                                                           | HTTP |
| ---------------------------------------------------------------------------------------------- | ---- |
| `VALIDATION_ERROR`, `BAD_REQUEST`                                                              | 400  |
| `UNAUTHORIZED`                                                                                 | 401  |
| `FORBIDDEN` (role or CSRF)                                                                     | 403  |
| `NOT_FOUND`, `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `SALE_NOT_FOUND` | 404  |
| `CONFLICT`, `INSUFFICIENT_STOCK`                                                               | 409  |
| `RATE_LIMITED`                                                                                 | 429  |
| `BAD_REQUEST` on a body larger than 1 MiB                                                      | 413  |
| `BAD_REQUEST` on a missing or non-JSON `content-type`                                          | 415  |
| `AUTH_NOT_CONFIGURED`                                                                          | 503  |
| `INTERNAL_ERROR`                                                                               | 500  |

## Collection endpoints

`GET /products`, `GET /categories`, `GET /customers`, `GET /sales` and
`GET /inventory/movements` share the pagination envelope:

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 },
  "_links": { "prev": { "href": "..." }, "next": { "href": "..." } }
}
```

`prev`/`next` are omitted at the boundaries.

`GET /products`, `GET /categories`, `GET /customers` accept:

| Param    | Default | Constraints                                                               |
| -------- | ------- | ------------------------------------------------------------------------- |
| `page`   | 1       | ≥ 1                                                                       |
| `limit`  | 20      | 1–100                                                                     |
| `search` | —       | 1–100 chars; case-insensitive, LIKE metacharacters are literal            |
| `sort`   | `name`  | products: `name` \| `price` \| `createdAt`; others: `name` \| `createdAt` |
| `order`  | `asc`   | `asc` \| `desc`                                                           |

Search fields: products → `name`, `sku`; customers → `name`, `email`,
`phone`; categories → `name`.

## Resources

| Method   | Path                                                 | Success                   |
| -------- | ---------------------------------------------------- | ------------------------- |
| `POST`   | `/products`, `/categories`, `/customers`             | 201 + `Location`          |
| `GET`    | `/products`, `/categories`, `/customers`             | 200 (collection envelope) |
| `GET`    | `/products/:id`, `/categories/:id`, `/customers/:id` | 200                       |
| `PATCH`  | `/products/:id`, `/categories/:id`, `/customers/:id` | 200                       |
| `DELETE` | `/products/:id`, `/categories/:id`, `/customers/:id` | 204                       |

Item responses are flat objects with ISO timestamps and HATEOAS `_links`
(`self`, `update`, `delete`). Updates are partial (PATCH); an empty body is
rejected. Deleting a category clears `categoryId` on its products
(`ON DELETE SET NULL`); deleting a customer or product referenced by a sale is
rejected with 409.

Unknown fields in request bodies are rejected with 400 (strict schemas).

## Sales

| Method | Path                | Roles              | Notes                                       |
| ------ | ------------------- | ------------------ | ------------------------------------------- |
| `POST` | `/sales`            | any authenticated  | 201 + `Location`; the acting user is stored |
| `GET`  | `/sales`            | any authenticated  | filters `status`, `customerId`              |
| `GET`  | `/sales/:id`        | any authenticated  | includes `items`                            |
| `POST` | `/sales/:id/cancel` | `ADMIN`, `MANAGER` | 200 with `status: CANCELLED`                |

```json
{
  "items": [{ "productId": "…", "quantity": 2 }],
  "customerId": "…"
}
```

`customerId` is optional. Prices are **never** taken from the request: each
line is priced from the product row inside the sale transaction, so
`unitPriceCents` and `subtotalCents` are server-computed and `totalCents` is
their sum.

Creating a sale is atomic: the product rows are locked, stock is decremented
and a `SALE` movement is appended to the inventory ledger, all in one
transaction. Rules:

- `items` must contain 1–100 lines, each with `quantity ≥ 1`, and a product may
  not repeat in the same sale (400)
- unknown product → 404 `PRODUCT_NOT_FOUND`
- `quantity` above available stock → 409 `INSUFFICIENT_STOCK`, and **nothing is
  written** — concurrent sales cannot oversell or lose an update
- a product referenced by a sale cannot be deleted (409 `CONFLICT`)

Cancellation restores the stock, appends a `CANCELLATION` movement and flips
the status; cancelling twice is 409 `CONFLICT`. The `_links.cancel` link is only
present while the sale is `COMPLETED`.

`GET /sales` accepts `status` (`COMPLETED` \| `CANCELLED`), `customerId`,
`sort` (`createdAt` \| `totalCents`, default `createdAt`) and `order` (default
`desc`).

### Idempotency

`POST /sales` accepts an optional `Idempotency-Key` header (1–200 printable ASCII
characters, no spaces). Keys are **scoped per user**, so two users may use the
same key and no user can be handed another user's sale.

| Situation                     | Response                                         |
| ----------------------------- | ------------------------------------------------ |
| First request with a key      | 201 + `Location`                                 |
| Same key, same body           | 200 + `Idempotent-Replayed: true`, original body |
| Same key, different body      | 409 `CONFLICT`                                   |
| Concurrent requests, same key | one 201, the rest replay the same sale           |

The key is claimed **inside the sale transaction**, so the key and the sale
commit or roll back together: a retried or duplicated request can never charge
the customer twice, and a sale that fails (for example insufficient stock)
leaves the key free for a corrected retry. The unique index on
`(user_id, key)` is the arbiter, so exactly one of N concurrent identical
requests wins.

## Inventory

| Method | Path                     | Roles              | Notes                       |
| ------ | ------------------------ | ------------------ | --------------------------- |
| `GET`  | `/inventory/movements`   | any authenticated  | filters `productId`, `type` |
| `POST` | `/inventory/adjustments` | `ADMIN`, `MANAGER` | 201 + `Location`            |

```json
{ "productId": "…", "quantity": 5, "type": "PURCHASE", "reason": "Restock" }
```

`type` is `PURCHASE`, `ADJUSTMENT` or `RETURN`; `quantity` is a non-zero signed
integer (positive adds stock, negative removes it) and `reason` is optional.
A removal larger than the available stock is 409 `INSUFFICIENT_STOCK` with no
partial write. Every change is appended to the ledger, so a product's history
is reconstructable regardless of whether it came from a sale, a cancellation
or a manual adjustment.

`GET /inventory/movements` accepts `productId`, `type` (`SALE`, `PURCHASE`,
`ADJUSTMENT`, `RETURN`, `CANCELLATION`), `sort` (`createdAt` \| `quantity`) and
`order` (default `desc`).

## Worked examples

The API authenticates with a cookie, so a terminal client sends cookies rather
than a bearer token.

### 1. Start the server and mint a local session

```bash
cp .env.example .env       # see docs/development.md for the full list
pnpm db:migrate
pnpm db:seed               # admin@pos.local, manager@pos.local, cashier@pos.local
pnpm dev
```

A real session comes from the OIDC redirect flow, which a terminal cannot
complete. To exercise writes locally, mint a session plus a CSRF token for a
seeded user (needs `pnpm build` and the server's own `COOKIE_SECRET`):

```bash
export BASE=http://localhost:3000/api/v1
export USER_ID=$(sqlite3 dev.db "select id from users where email='admin@pos.local'")

read -r SESSION CSRF <<<"$(node --input-type=module -e "
  import { createSessionToken } from './dist/application/auth/session.js';
  import { csrfToken } from './dist/interfaces/http/cookies.js';
  process.stdout.write(createSessionToken(process.argv[1], process.env.COOKIE_SECRET) + ' ' + csrfToken());
" "$USER_ID")"
```

Wrap `curl` so every example carries the session, the CSRF cookie and the
matching `x-csrf-token` header:

```bash
pos() {
  curl -sS -b "pos_session=$SESSION; pos_csrf=$CSRF" \
    -H "x-csrf-token: $CSRF" "$@"
}
```

```bash
pos "$BASE/auth/me"
# {"id":"…","email":"admin@pos.local","name":"…","role":"ADMIN", …}
```

In a browser the jar handles this for you: the server sets `pos_session` and
`pos_csrf` on `/auth/callback`, and a write is `403 FORBIDDEN` unless the
`x-csrf-token` header equals the `pos_csrf` cookie.

### 2. Create a category and a product

```bash
pos -X POST "$BASE/categories" -H "content-type: application/json" \
  -d '{"name":"Bebidas"}'
# 201, Location: /api/v1/categories/<uuid>

pos -X POST "$BASE/products" -H "content-type: application/json" \
  -d '{"sku":"COCA-350","name":"Coca-Cola 350ml","priceCents":599,
       "stockQuantity":120,"categoryId":"<uuid>"}'
# 201
```

```json
{
  "id": "9f1c…",
  "sku": "COCA-350",
  "name": "Coca-Cola 350ml",
  "description": null,
  "priceCents": 599,
  "stockQuantity": 120,
  "categoryId": "3b2a…",
  "createdAt": "2026-03-01T12:00:00.000Z",
  "updatedAt": "2026-03-01T12:00:00.000Z",
  "_links": {
    "self": { "href": "/api/v1/products/9f1c…" },
    "update": { "href": "/api/v1/products/9f1c…", "method": "PATCH" },
    "delete": { "href": "/api/v1/products/9f1c…", "method": "DELETE" }
  }
}
```

Money is integer cents: `599` is 5,99. Floats are rejected with `400`.

### 3. Search, sort, paginate

```bash
pos -G "$BASE/products" \
  --data-urlencode "search=coca" \
  --data-urlencode "sort=price" --data-urlencode "order=asc" \
  --data-urlencode "limit=10"
```

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 },
  "_links": { "next": { "href": "/api/v1/products?limit=10&page=2" } }
}
```

Follow `_links.next` instead of counting pages; it disappears on the last page,
and `_links.prev` is absent on the first.

### 4. Register a sale

```bash
pos -X POST "$BASE/sales" -H "content-type: application/json" \
  -H "idempotency-key: till-3-2026-03-01-0001" \
  -d '{"customerId":"<uuid>","items":[{"productId":"<uuid>","quantity":2}]}'
# 201, Location: /api/v1/sales/<uuid>
```

```json
{
  "id": "5e7a…",
  "customerId": "1a2b…",
  "userId": "9c8d…",
  "status": "COMPLETED",
  "totalCents": 1198,
  "itemCount": 1,
  "createdAt": "2026-03-01T12:05:00.000Z",
  "updatedAt": "2026-03-01T12:05:00.000Z",
  "items": [
    {
      "id": "7d8e…",
      "productId": "9f1c…",
      "quantity": 2,
      "unitPriceCents": 599,
      "subtotalCents": 1198
    }
  ],
  "_links": {
    "self": { "href": "/api/v1/sales/5e7a…" },
    "cancel": { "href": "/api/v1/sales/5e7a…/cancel", "method": "POST" }
  }
}
```

Send the exact same request again with the same `idempotency-key` and you get
`200` plus `Idempotent-Replayed: true` and the original sale — never a second
charge. Same key with a different body is `409 CONFLICT`.

### 5. Cancel a sale

```bash
pos -X POST "$BASE/sales/5e7a…/cancel"
# 200 — status becomes CANCELLED, stock is restored, a CANCELLATION movement is
# appended to the ledger, and the `cancel` link is withdrawn.
```

### 6. Adjust stock and read the ledger

```bash
pos -X POST "$BASE/inventory/adjustments" -H "content-type: application/json" \
  -d '{"productId":"<uuid>","quantity":-3,"type":"ADJUSTMENT","reason":"Danos"}'
# 201

pos -G "$BASE/inventory/movements" \
  --data-urlencode "productId=<uuid>" --data-urlencode "type=SALE"
```

Positive `quantity` adds stock, negative removes it. Removing more than is on
hand is `409 INSUFFICIENT_STOCK` and writes nothing.

### 7. Read a validation failure

```bash
pos -X POST "$BASE/products" -H "content-type: application/json" \
  -d '{"sku":"","name":"Sem preço"}'
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "sku", "message": "Too small: expected string to have >=1 characters" },
      {
        "path": "priceCents",
        "message": "Invalid input: expected number, received undefined"
      }
    ]
  }
}
```

`details[].path` is the offending field, so a form can highlight it directly.

## Authorization

| Operation                                               | Roles              | Failure |
| ------------------------------------------------------- | ------------------ | ------- |
| `GET` collection or item (all resources)                | any of the three   | 401/403 |
| `POST`/`PATCH`/`DELETE` products, categories, customers | `ADMIN`, `MANAGER` | 401/403 |
| `POST /sales`                                           | any of the three   | 401/403 |
| `POST /sales/:id/cancel`                                | `ADMIN`, `MANAGER` | 401/403 |
| `POST /inventory/adjustments`                           | `ADMIN`, `MANAGER` | 401/403 |

Missing, tampered or expired session → 401 `UNAUTHORIZED`. Authenticated but
not permitted → 403 `FORBIDDEN`. Missing `COOKIE_SECRET` → 503
`AUTH_NOT_CONFIGURED`. Roles are reloaded from the database on every request,
so a promotion or deletion applies immediately.

`/auth/login` and `/auth/callback` are public; `/health` is public and never
rate-limited.

## Authentication

Stateless, cookie-based (`pos_session`, HttpOnly, SameSite=Lax, `Secure` in
production). No bearer tokens.

| Method | Path             | Behavior                                                                               |
| ------ | ---------------- | -------------------------------------------------------------------------------------- |
| `GET`  | `/auth/login`    | 302 to the OIDC provider (sets `pos_oauth` pending-login cookie with state/nonce/PKCE) |
| `GET`  | `/auth/callback` | 302 to `/` on success (sets `pos_session` + `pos_csrf`, 8 h); 401 on failure           |
| `GET`  | `/auth/me`       | 200 current user or 401                                                                |
| `POST` | `/auth/logout`   | 204, clears the session and CSRF cookies                                               |

New OIDC users are created as `CASHIER`; `pnpm db:seed` pre-creates
`admin@pos.local`, `manager@pos.local` and `cashier@pos.local` so a matching
identity provider account inherits the intended role.

When OAuth is not configured, login and `/me` answer 503
`AUTH_NOT_CONFIGURED` (fail closed).

## Hardening

| Control          | Behaviour                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limiting    | per client IP; 429 `RATE_LIMITED` + `retry-after`; `x-ratelimit-limit/remaining/reset` headers                                         |
| Security headers | `x-content-type-options`, `x-frame-options`, `referrer-policy`, `cross-origin-opener-policy`, `permissions-policy`; HSTS in production |
| CORS             | only when `CORS_ORIGINS` is set, and only for allowlisted origins                                                                      |
| CSRF             | double-submit: cookie-authenticated writes must echo `pos_csrf` in `x-csrf-token`, else 403                                            |
| Body size        | 1 MiB limit; larger bodies are rejected with 413                                                                                       |
| Sanitized errors | no stack traces, SQL text or paths in responses                                                                                        |

Rate limiting and CSRF apply to every `/api/v1` route; requests without a
session cookie are answered 401 before the CSRF check, so unauthenticated
callers never learn about the token.

## Health

`GET /health` (root, outside `/api/v1`) → 200 `{ "status": "ok" }`.
