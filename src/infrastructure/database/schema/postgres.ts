import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey();
const createdAt = () => bigint("created_at", { mode: "number" }).notNull();
const updatedAt = () => bigint("updated_at", { mode: "number" }).notNull();

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("users_role_valid", sql`(${t.role}) in ('ADMIN', 'MANAGER', 'CASHIER')`),
  ],
);

export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable(
  "products",
  {
    id: id(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull(),
    stockQuantity: integer("stock_quantity").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("products_price_non_negative", sql`${t.priceCents} >= 0`),
    check("products_stock_non_negative", sql`${t.stockQuantity} >= 0`),
    index("products_category_id_idx").on(t.categoryId),
    index("products_name_idx").on(t.name),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").unique(),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customers_name_idx").on(t.name)],
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("sales_total_non_negative", sql`${t.totalCents} >= 0`),
    check("sales_status_valid", sql`(${t.status}) in ('COMPLETED', 'CANCELLED')`),
    index("sales_customer_id_idx").on(t.customerId),
    index("sales_user_id_idx").on(t.userId),
    index("sales_created_at_idx").on(t.createdAt),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
  },
  (t) => [
    check("sale_items_quantity_positive", sql`${t.quantity} > 0`),
    check("sale_items_unit_price_non_negative", sql`${t.unitPriceCents} >= 0`),
    check(
      "sale_items_subtotal_matches",
      sql`${t.subtotalCents} = ${t.quantity} * ${t.unitPriceCents}`,
    ),
    uniqueIndex("sale_items_sale_id_product_id_uq").on(t.saleId, t.productId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("inventory_movements_quantity_non_zero", sql`${t.quantity} != 0`),
    check(
      "inventory_movements_type_valid",
      sql`(${t.type}) in ('SALE', 'PURCHASE', 'ADJUSTMENT', 'RETURN', 'CANCELLATION')`,
    ),
    index("inventory_movements_product_created_idx").on(t.productId, t.createdAt),
  ],
);
