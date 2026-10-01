# API

Base URL: `/api/v1`. All responses are JSON except redirects. Timestamps are
RFC 3339 (ISO 8601) strings derived from epoch-millisecond integers; money is
integer cents (`priceCents`, `totalCents`).

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

`details` is present only for validation failures. Server errors are
sanitized to `INTERNAL_ERROR` / `Internal server error`.

| Code                                                                         | HTTP |
| ---------------------------------------------------------------------------- | ---- |
| `VALIDATION_ERROR`, `BAD_REQUEST`                                            | 400  |
| `UNAUTHORIZED`                                                               | 401  |
| `FORBIDDEN`                                                                  | 403  |
| `NOT_FOUND`, `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `CUSTOMER_NOT_FOUND` | 404  |
| `CONFLICT`, `INSUFFICIENT_STOCK`                                             | 409  |
| `RATE_LIMITED`                                                               | 429  |
| `AUTH_NOT_CONFIGURED`                                                        | 503  |
| `INTERNAL_ERROR`                                                             | 500  |

## Collection endpoints

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

Response envelope:

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 },
  "_links": { "prev": { "href": "..." }, "next": { "href": "..." } }
}
```

`prev`/`next` are omitted at the boundaries.

## Authorization

Every resource route requires a valid `pos_session` cookie and a role:

| Operation                 | Roles              | Failure |
| ------------------------- | ------------------ | ------- |
| `GET` collection or item  | any of the three   | 401/403 |
| `POST`, `PATCH`, `DELETE` | `ADMIN`, `MANAGER` | 401/403 |

Missing, tampered or expired session → 401 `UNAUTHORIZED`. Authenticated but
not permitted → 403 `FORBIDDEN`. Missing `COOKIE_SECRET` → 503
`AUTH_NOT_CONFIGURED`.

`/auth/login` and `/auth/callback` are public; `/health` is public.

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
(`ON DELETE SET NULL`); deleting a customer with sales is rejected with 409.

Unknown fields in request bodies are rejected with 400 (strict schemas).

## Authentication

Stateless, cookie-based (`pos_session`, HttpOnly, SameSite=Lax, `Secure` in
production). No bearer tokens.

| Method | Path             | Behavior                                                                               |
| ------ | ---------------- | -------------------------------------------------------------------------------------- |
| `GET`  | `/auth/login`    | 302 to the OIDC provider (sets `pos_oauth` pending-login cookie with state/nonce/PKCE) |
| `GET`  | `/auth/callback` | 302 to `/` on success (sets `pos_session`, 8 h); 401 on failure                        |
| `GET`  | `/auth/me`       | 200 current user or 401                                                                |
| `POST` | `/auth/logout`   | 204, clears the session cookie                                                         |

When OAuth is not configured, login and `/me` answer 503
`AUTH_NOT_CONFIGURED` (fail closed).

## Health

`GET /health` (root, outside `/api/v1`) → 200 `{ "status": "ok" }`.
