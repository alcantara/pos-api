CREATE TABLE `idempotency_records` (
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "idempotency_records_key_valid" CHECK(length("idempotency_records"."key") between 1 and 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_records_user_key_uq` ON `idempotency_records` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `idempotency_records_created_at_idx` ON `idempotency_records` (`created_at`);