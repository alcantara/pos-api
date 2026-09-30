CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"created_at" bigint NOT NULL,
	CONSTRAINT "inventory_movements_quantity_non_zero" CHECK ("inventory_movements"."quantity" != 0),
	CONSTRAINT "inventory_movements_type_valid" CHECK (("inventory_movements"."type") in ('SALE', 'PURCHASE', 'ADJUSTMENT', 'RETURN', 'CANCELLATION'))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" bigint NOT NULL,
	"stock_quantity" integer NOT NULL,
	"category_id" uuid,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price_cents" >= 0),
	CONSTRAINT "products_stock_non_negative" CHECK ("products"."stock_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_unit_price_non_negative" CHECK ("sale_items"."unit_price_cents" >= 0),
	CONSTRAINT "sale_items_subtotal_matches" CHECK ("sale_items"."subtotal_cents" = "sale_items"."quantity" * "sale_items"."unit_price_cents")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid,
	"user_id" uuid NOT NULL,
	"total_cents" bigint NOT NULL,
	"status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "sales_total_non_negative" CHECK ("sales"."total_cents" >= 0),
	CONSTRAINT "sales_status_valid" CHECK (("sales"."status") in ('COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_valid" CHECK (("users"."role") in ('ADMIN', 'MANAGER', 'CASHIER'))
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_created_idx" ON "inventory_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_items_sale_id_product_id_uq" ON "sale_items" USING btree ("sale_id","product_id");--> statement-breakpoint
CREATE INDEX "sales_customer_id_idx" ON "sales" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_user_id_idx" ON "sales" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "sales" USING btree ("created_at");