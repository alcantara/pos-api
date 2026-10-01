import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createCategory } from "../../application/categories/create-category.js";
import { createCustomer } from "../../application/customers/create-customer.js";
import type { Dependencies } from "../../application/dependencies.js";
import { createProduct } from "../../application/products/create-product.js";
import type { Role, User } from "../../domain/entities/user.js";
import { resolveDialect } from "./client.js";
import { createDependencies } from "../dependencies.js";

interface SeedUser {
  email: string;
  name: string;
  role: Role;
}

export const SEED_USERS: readonly SeedUser[] = [
  { email: "admin@pos.local", name: "POS Administrator", role: "ADMIN" },
  { email: "manager@pos.local", name: "POS Manager", role: "MANAGER" },
  { email: "cashier@pos.local", name: "POS Cashier", role: "CASHIER" },
];

interface SeedEntry {
  label: string;
  name?: string;
  email?: string;
  sku?: string;
}

export interface SeedProduct {
  label: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  stockQuantity: number;
  categoryName: string;
}

export interface SeedCategory {
  label: string;
  name: string;
}

export interface SeedCustomer {
  label: string;
  name: string;
  email: string;
  phone: string;
}

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  { label: "category", name: "Peripherals" },
  { label: "category", name: "Displays" },
];

export const SEED_PRODUCTS: readonly SeedProduct[] = [
  {
    label: "product",
    sku: "SEED-KEYBOARD-001",
    name: "Mechanical Keyboard",
    description: "Sample catalog entry",
    priceCents: 34990,
    stockQuantity: 25,
    categoryName: "Peripherals",
  },
  {
    label: "product",
    sku: "SEED-MOUSE-001",
    name: "Wireless Mouse",
    description: "Sample catalog entry",
    priceCents: 8990,
    stockQuantity: 40,
    categoryName: "Peripherals",
  },
  {
    label: "product",
    sku: "SEED-MONITOR-001",
    name: "27 inch Monitor",
    description: "Sample catalog entry",
    priceCents: 129900,
    stockQuantity: 8,
    categoryName: "Displays",
  },
];

export const SEED_CUSTOMERS: readonly SeedCustomer[] = [
  {
    label: "customer",
    name: "Ana Sample",
    email: "ana@sample.pos",
    phone: "+55 11 90000-0001",
  },
  {
    label: "customer",
    name: "Bruno Sample",
    email: "bruno@sample.pos",
    phone: "+55 11 90000-0002",
  },
];

export interface SeedResult {
  created: SeedEntry[];
  existing: SeedEntry[];
}

function describeEntry(entry: SeedEntry): string {
  return entry.name ?? entry.email ?? entry.sku ?? entry.label;
}

export interface FullSeedResult extends SeedResult {
  users: { created: SeedUser[]; existing: SeedUser[] };
}

export async function seedUsers(
  dependencies: Dependencies,
): Promise<{ created: SeedUser[]; existing: SeedUser[] }> {
  const result = { created: [] as SeedUser[], existing: [] as SeedUser[] };

  for (const seed of SEED_USERS) {
    const found = await dependencies.users.findByEmail(seed.email);
    if (found) {
      result.existing.push(seed);
      continue;
    }

    const now = Date.now();
    const user: User = {
      id: randomUUID(),
      email: seed.email,
      name: seed.name,
      passwordHash: null,
      role: seed.role,
      createdAt: now,
      updatedAt: now,
    };
    await dependencies.users.insert(user);
    result.created.push(seed);
  }

  return result;
}

export async function seedCatalog(dependencies: Dependencies): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };
  const categoryIds = new Map<string, string>();

  for (const category of SEED_CATEGORIES) {
    const found = await findCategoryByName(dependencies, category.name);
    if (found) {
      categoryIds.set(category.name, found);
      result.existing.push(category);
      continue;
    }
    const created = await createCategory(dependencies.categories, {
      name: category.name,
    });
    categoryIds.set(category.name, created.id);
    result.created.push(category);
  }

  for (const product of SEED_PRODUCTS) {
    const found = await dependencies.products.findBySku(product.sku);
    if (found) {
      result.existing.push(product);
      continue;
    }
    await createProduct(dependencies.products, dependencies.categories, {
      sku: product.sku,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      stockQuantity: product.stockQuantity,
      categoryId: categoryIds.get(product.categoryName) ?? null,
    });
    result.created.push(product);
  }

  for (const customer of SEED_CUSTOMERS) {
    const found = await dependencies.customers.findByEmail(customer.email);
    if (found) {
      result.existing.push(customer);
      continue;
    }
    await createCustomer(dependencies.customers, {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    });
    result.created.push(customer);
  }

  return result;
}

export async function seedAll(dependencies: Dependencies): Promise<FullSeedResult> {
  const users = await seedUsers(dependencies);
  const catalog = await seedCatalog(dependencies);
  return {
    users,
    created: [
      ...users.created.map((user) => ({
        label: `user ${user.role}`,
        name: user.email,
      })),
      ...catalog.created,
    ],
    existing: [
      ...users.existing.map((user) => ({
        label: `user ${user.role}`,
        name: user.email,
      })),
      ...catalog.existing,
    ],
  };
}

async function findCategoryByName(
  dependencies: Dependencies,
  name: string,
): Promise<string | null> {
  const page = await dependencies.categories.list({
    page: 1,
    limit: 100,
    sort: "name",
    order: "asc",
  });
  return page.rows.find((row) => row.name === name)?.id ?? null;
}

async function main(): Promise<void> {
  const { loadDotEnv, loadEnv } = await import("../../config/env.js");
  loadDotEnv();
  const env = loadEnv();
  const { dependencies, close } = await createDependencies(env);

  try {
    const result = await seedAll(dependencies);
    for (const entry of result.created) {
      console.log(`created ${entry.label.padEnd(12)} ${describeEntry(entry)}`);
    }
    for (const entry of result.existing) {
      console.log(`kept    ${entry.label.padEnd(12)} ${describeEntry(entry)}`);
    }
    console.log(
      `seed complete (${resolveDialect(env.DATABASE_URL)}): ` +
        `${result.created.length} created, ${result.existing.length} already present`,
    );
  } finally {
    await close();
  }
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
