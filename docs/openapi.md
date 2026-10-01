# API reference (OpenAPI)

The machine-readable contract lives in [`openapi.yaml`](./openapi.yaml)
(OpenAPI 3.1). This page explains how to read it, browse it and keep it honest.

## Browsing the spec

### Swagger UI (interactive)

Any static server works:

```bash
pnpm dlx serve docs          # or: python3 -m http.server -d docs 8080
```

Then open the Swagger UI pointed at the file:

- <https://editor.swagger.io/> — drop the file or paste its URL
- Redoc: <https://redocly.github.io/redoc/>

Remember to set the server to `http://localhost:3000/api/v1` (the default one in
the document already does).

### From the command line

```bash
# Validate structure and references
pnpm test:spec

# Pretty-print to JSON
pnpm exec yaml docs/openapi.yaml > /tmp/openapi.json
```

## Authenticating in Swagger UI

The API authenticates with a **cookie**, so `Authorize` in Swagger UI is of
limited use — the UI cannot hold a `Set-Cookie` it did not receive through the
browser. Two practical paths:

1. Log in through the browser (`GET /api/v1/auth/login`, redirect flow), then
   point Swagger UI at the same origin so it reuses the cookie. The
   `sessionCookie` scheme is declared as `apiKey` in `cookie` for tooling that
   does support it.
2. Generate a session cookie locally (requires `pnpm build`):

   ```bash
   COOKIE_SECRET="$(openssl rand -base64 48)" \
   node --input-type=module -e "
     import { createSessionToken } from './dist/application/auth/session.js';
     console.log('pos_session=' + createSessionToken(process.argv[1], process.env.COOKIE_SECRET));
   " <user-id>
   ```

   Use a `users.id` from the database, and the same `COOKIE_SECRET` the server
   runs with. Paste the result as a `Cookie: pos_session=…` request header in
   Swagger UI.

For writes, also send `x-csrf-token` matching the `pos_csrf` cookie — see
[CSRF protection](./security.md).

## How the spec is kept in sync

`tests/docs/openapi.test.ts` fails the build when the document and the code
disagree. It asserts that:

- every registered route is documented, and nothing is documented that the
  application does not serve (both directions);
- every operation has an `operationId`, tags and at least one response;
- `operationId`s are unique and every tag is declared in `info`;
- only `/auth/login` and `/auth/callback` are public — everything else inherits
  the session cookie;
- every non-GET operation documents `x-csrf-token`;
- `POST /sales` documents the idempotency header and both the `201` and the
  replayed `200`;
- session routes document `401`, item lookups `404`, role-gated and CSRF writes
  `403`, and read collections `429`.

Run it with `pnpm test:docs`.

Adding a route means adding it to the spec in the same change — the test is the
reminder.

## Conventions encoded in the document

| Concern             | Where it appears                                |
| ------------------- | ----------------------------------------------- |
| Integer cents       | `priceCents`, `totalCents`, `unitPriceCents`    |
| RFC 3339 timestamps | `createdAt`, `updatedAt`                        |
| Collection envelope | `CollectionEnvelope`, `Pagination`              |
| HATEOAS             | `Link`, `_links` on items and collections       |
| Role matrix         | `info.description`                              |
| Error shape         | `Error` — `details` only on validation failures |
| Currency amounts    | never sent by the client on `POST /sales`       |

## Known gaps

- The spec documents implemented behaviour only. `audit log` and `OpenAPI
generation from the Zod schemas` are still pending, so the document is
  hand-maintained.
- `GET /health` is served at the root, outside `/api/v1`, so it is documented in
  [`api.md`](./api.md) rather than here.
