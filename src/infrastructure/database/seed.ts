import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Dependencies } from "../../application/dependencies.js";
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

export interface SeedResult {
  created: SeedUser[];
  existing: SeedUser[];
}

export async function seedUsers(dependencies: Dependencies): Promise<SeedResult> {
  const result: SeedResult = { created: [], existing: [] };

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

async function main(): Promise<void> {
  const { loadDotEnv, loadEnv } = await import("../../config/env.js");
  loadDotEnv();
  const env = loadEnv();
  const { dependencies, close } = await createDependencies(env);

  try {
    const result = await seedUsers(dependencies);
    for (const user of result.created) {
      console.log(`created ${user.role.padEnd(7)} ${user.email}`);
    }
    for (const user of result.existing) {
      console.log(`kept    ${user.role.padEnd(7)} ${user.email}`);
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
