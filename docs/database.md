# Database

## Engine selection

`DATABASE_URL` selects the engine:

- `file:./dev.db` — SQLite for local dev and tests
- `postgresql://...` — PostgreSQL for integration tests and production

Code must remain database-independent. Differences in transactions, locking,
concurrency, data types, constraints, and migrations are isolated in
infrastructure.

## Schema

Core entities: user, role, category, product, customer, sale, sale_item,
payment, inventory_movement, cash_register, register_session, register_movement,
audit_log, idempotency_record.

Constraints enforced at DB level: NOT NULL, UNIQUE (SKU, barcode), FOREIGN KEY,
CHECK where appropriate, indexes on search/filter/sort fields.

## Migrations

Drizzle migrations, versioned. Never make destructive migrations casually.

## Soft deletion

Used selectively on products and categories (`deleted_at`) where historical
sales must continue referencing them. Not applied blindly to every table.

## Optimistic concurrency

Version/updated_at field on mutable resources. Stale writes return 409 Conflict.

## Seeding

`pnpm db:seed` creates deterministic dev data: admin/manager/cashier roles,
sample categories, products, customers. Dev-only credentials — documented,
never real secrets.

## `idempotency_records`

Written by `POST /sales` when the request carries an `Idempotency-Key`.

| Column         | Notes                                         |
| -------------- | --------------------------------------------- |
| `user_id`      | FK → `users.id`, `ON DELETE CASCADE`          |
| `key`          | client token, 1–200 chars (CHECK)             |
| `request_hash` | SHA-256 of the canonical body; mismatch → 409 |
| `resource_id`  | id of the created sale                        |

Unique index on `(user_id, key)`. The row is inserted in the same transaction
as the sale, so the key cannot outlive a failed sale and a key can never be
claimed by two sales. Check constraint only — a stale key expires with no
cleanup job; records grow with distinct keys per user.
