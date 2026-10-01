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
