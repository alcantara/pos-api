CREATE TABLE "idempotency_records" (
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "idempotency_records_key_valid" CHECK (length("idempotency_records"."key") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_user_key_uq" ON "idempotency_records" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records" USING btree ("created_at");