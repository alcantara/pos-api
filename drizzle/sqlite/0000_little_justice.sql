CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_movements_quantity_non_zero" CHECK("inventory_movements"."quantity" != 0),
	CONSTRAINT "inventory_movements_type_valid" CHECK(("inventory_movements"."type") in ('SALE', 'PURCHASE', 'ADJUSTMENT', 'RETURN', 'CANCELLATION'))
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_product_created_idx` ON `inventory_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_cents` integer NOT NULL,
	`stock_quantity` integer NOT NULL,
	`category_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "products_price_non_negative" CHECK("products"."price_cents" >= 0),
	CONSTRAINT "products_stock_non_negative" CHECK("products"."stock_quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`subtotal_cents` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sale_items_quantity_positive" CHECK("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_unit_price_non_negative" CHECK("sale_items"."unit_price_cents" >= 0),
	CONSTRAINT "sale_items_subtotal_matches" CHECK("sale_items"."subtotal_cents" = "sale_items"."quantity" * "sale_items"."unit_price_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_items_sale_id_product_id_uq` ON `sale_items` (`sale_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`user_id` text NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sales_total_non_negative" CHECK("sales"."total_cents" >= 0),
	CONSTRAINT "sales_status_valid" CHECK(("sales"."status") in ('COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX `sales_customer_id_idx` ON `sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_user_id_idx` ON `sales` (`user_id`);--> statement-breakpoint
CREATE INDEX `sales_created_at_idx` ON `sales` (`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_role_valid" CHECK(("users"."role") in ('ADMIN', 'MANAGER', 'CASHIER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);