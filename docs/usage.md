# Usage — flows across endpoints

Per-endpoint reference lives in [`api.md`](./api.md); the interactive contract
and Swagger UI are described in [`openapi.md`](./openapi.md). This page walks
through the sequences a POS actually performs.

Unless stated otherwise, the examples reuse the `pos()` helper from
[`api.md` → Worked examples](./api.md#1-start-the-server-and-mint-a-local-session),
which carries the session cookie, the CSRF cookie and the matching
`x-csrf-token` header.

## Opening a till

1. `GET /auth/me` — confirm who the cashier is and what role they hold. A `401`
   means the session expired; send the browser through `GET /auth/login` again.
2. `GET /products?limit=100&sort=name` — load the catalogue. One page of at most
   100 keeps a cold cache small; follow `_links.next` for the rest.
3. `GET /inventory/movements?type=ADJUSTMENT` — nothing here for a fresh shift.

A `CASHIER` may read the catalogue and sell, but every write to the catalogue
answers `403`; stocking the shelves needs `MANAGER` or `ADMIN`.

## Selling

```bash
pos -X POST "$BASE/sales" -H "content-type: application/json" \
  -H "idempotency-key: till-3-2026-03-01-0001" \
  -d '{"customerId":"<uuid>","items":[{"productId":"<uuid>","quantity":2}]}'
```

Rules worth internalising:

- **Prices come from the database.** Sending `unitPriceCents` is not just
  ignored, it is rejected: unknown fields fail validation with `400`.
- **One transaction.** Lines are locked, stock is decremented and a `SALE`
  movement is appended together. Either all of it lands or none of it does.
- **Short stock fails the whole sale** with `409 INSUFFICIENT_STOCK` — there is
  no partial basket, and the idempotency key stays free for a corrected retry.
- **The key is claimed inside that transaction**, so retrying after a timeout
  replays the original sale instead of charging twice.

Verify afterwards:

```bash
pos "$BASE/products/<uuid>"          # stockQuantity already decremented
pos -G "$BASE/inventory/movements" --data-urlencode "productId=<uuid>"
```

## Handling a flaky till

The key is what makes the sale safe to retry. Use one key per logical sale
attempt — a till id plus a sequence — and keep it for as long as the request may
still be in flight:

| Outcome                             | What to do                                             |
| ----------------------------------- | ------------------------------------------------------ |
| `201`                               | done                                                   |
| `200` + `Idempotent-Replayed: true` | done — this is the same sale, already committed        |
| timeout / 5xx / connection reset    | retry the identical request with the same key          |
| `409 CONFLICT` on the key           | the key was used with a different body: pick a new one |
| `409 INSUFFICIENT_STOCK`            | fix the basket and use the same key again              |

Never mint a fresh key to "get past" an error: that is precisely how a customer
gets charged twice.

## Returning or cancelling

Full cancellation:

```bash
pos -X POST "$BASE/sales/<id>/cancel"
```

Status becomes `CANCELLED`, stock returns to the products, and a `CANCELLATION`
movement is appended. A second cancellation is `409 CONFLICT` — the `_links.cancel`
entry disappears from the response, which is the reliable way to know the sale is
no longer cancellable.

For a partial return, use the inventory ledger rather than editing a sale:

```bash
pos -X POST "$BASE/inventory/adjustments" -H "content-type: application/json" \
  -d '{"productId":"<uuid>","quantity":-1,"type":"RETURN","reason":"Produto devolvido"}'
```

Sales are immutable once written; the ledger is the history.

## Restocking and reconciling

```bash
pos -X POST "$BASE/inventory/adjustments" -H "content-type: application/json" \
  -d '{"productId":"<uuid>","quantity":24,"type":"PURCHASE","reason":"Nota 1234"}'

pos -X POST "$BASE/inventory/adjustments" -H "content-type: application/json" \
  -d '{"productId":"<uuid>","quantity":-2,"type":"ADJUSTMENT","reason":"Avaria"}'
```

`quantity` is signed and must be non-zero. `type` is `PURCHASE`, `ADJUSTMENT` or
`RETURN`; the movement type that actually reaches the ledger is `SALE`,
`PURCHASE`, `ADJUSTMENT`, `RETURN` or `CANCELLATION`, because sales and
cancellations write to it too.

A stock count is then reproducible from the ledger:

```bash
pos -G "$BASE/inventory/movements" \
  --data-urlencode "productId=<uuid>" --data-urlencode "limit=100"
```

Sum the `quantity` values — every row is signed — and compare with
`stockQuantity` on the product. If they differ, an adjustment was lost; the
ledger is the audit trail.

## Working offline, then catching up

1. Collect sales locally; each carries an `idempotency-key`.
2. On reconnect, send them in any order.
3. A key already seen replays (`200` + `Idempotent-Replayed: true`), so
   re-sending the whole batch is safe.

No client-side ordering is required, and no sale is applied twice. Concurrency is
covered by a unique index on `(user_id, key)`, so two in-flight retries of the
same sale produce one `201` and one replay.

## Reading reports

`GET /sales` filters by `status`, `customerId`, and sorts by `createdAt` or
`totalCents`:

```bash
pos -G "$BASE/sales" \
  --data-urlencode "status=COMPLETED" \
  --data-urlencode "sort=totalCents" --data-urlencode "order=desc" \
  --data-urlencode "limit=100"
```

Items are not included in list responses — fetch `GET /sales/{id}` for a single
basket.

## Administering the catalogue

```bash
pos -X POST   "$BASE/products"    -H "content-type: application/json" -d '{…}'
pos -X PATCH  "$BASE/products/<id>" -H "content-type: application/json" -d '{"priceCents":649}'
pos -X DELETE "$BASE/products/<id>"
```

- `PATCH` is partial; an empty body is rejected with `400`.
- Deleting a category clears `categoryId` on its products instead of failing.
- Deleting a product or customer referenced by a sale is `409 CONFLICT` — the
  history has to stay reconstructable.
- Unknown fields are rejected everywhere, so a typo in a field name fails loudly
  rather than being silently dropped.

## What to do with each error

| Status | Meaning                                                       | Action                                         |
| ------ | ------------------------------------------------------------- | ---------------------------------------------- |
| 400    | validation failed                                             | fix `error.details[].path` fields              |
| 401    | no/expired session                                            | re-run the login redirect                      |
| 403    | role or CSRF                                                  | correct role, or echo `pos_csrf` in the header |
| 404    | unknown id                                                    | re-read the collection; ids are UUIDs          |
| 409    | conflict, replay with a different body, or insufficient stock | resolve, then retry with the same key          |
| 413    | body over 1 MiB                                               | split the request                              |
| 415    | missing/wrong `content-type`                                  | send `application/json`                        |
| 429    | rate limited                                                  | back off for `retry-after` seconds             |
| 503    | auth not configured                                           | server-side fix: set the OIDC variables        |

Server errors carry `INTERNAL_ERROR` and a sanitized message: no stack traces,
SQL or paths. When chasing one, match the timestamp against the structured logs —
Fastify's pino logger stamps every line with a `reqId` that correlates the request
with its log entries.
