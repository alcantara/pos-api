import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreatedDependencies } from "../../src/infrastructure/dependencies.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";
import { loadEnv } from "../../src/config/env.js";
import { SqliteDatabase } from "../../src/infrastructure/database/sqlite.js";
import * as sqliteSchema from "../../src/infrastructure/database/schema/sqlite.js";
import * as pgSchema from "../../src/infrastructure/database/schema/postgres.js";
import type { User } from "../../src/domain/entities/user.js";
import type { UserRepository } from "../../src/application/ports/user-repository.js";
import { ConflictError } from "../../src/domain/errors/domain-error.js";

function targets(): Array<{ name: string; databaseUrl: string }> {
  const env = loadEnv();
  const list = [{ name: "sqlite", databaseUrl: "file::memory:" }];
  if (env.TEST_POSTGRES_URL) {
    list.push({ name: "postgres", databaseUrl: env.TEST_POSTGRES_URL });
  }
  return list;
}

function makeUser(overrides: Partial<User> = {}): User {
  const now = Date.now();
  return {
    id: randomUUID(),
    email: `${randomUUID()}@example.com`,
    name: "Test User",
    passwordHash: null,
    role: "CASHIER",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe.each(targets())("user repository ($name)", (target) => {
  let created: CreatedDependencies;
  let users: UserRepository;
  const insertedUserIds: string[] = [];

  beforeAll(async () => {
    created = await createDependencies({
      ...loadEnv(),
      DATABASE_URL: target.databaseUrl,
    });
    users = created.dependencies.users;
  });

  afterAll(async () => {
    const database = created.database;
    for (const id of insertedUserIds) {
      if (database instanceof SqliteDatabase) {
        await database.context.guard(async () => {
          await database.context.db
            .delete(sqliteSchema.users)
            .where(eq(sqliteSchema.users.id, id));
        });
      } else {
        await database.context.db
          .delete(pgSchema.users)
          .where(eq(pgSchema.users.id, id));
      }
    }
    await created.close();
  });

  function track(user: User): User {
    insertedUserIds.push(user.id);
    return user;
  }

  it("inserts and reads back by id and email", async () => {
    const user = track(makeUser({ role: "ADMIN" }));
    await users.insert(user);

    expect(await users.findById(user.id)).toEqual(user);
    expect(await users.findByEmail(user.email)).toEqual(user);
    expect((await users.findById(user.id))?.role).toBe("ADMIN");
  });

  it("returns null for unknown id and email", async () => {
    expect(await users.findById(randomUUID())).toBeNull();
    expect(await users.findByEmail(`missing-${randomUUID()}`)).toBeNull();
  });

  it("rejects a duplicate email with ConflictError", async () => {
    const email = `${randomUUID()}@example.com`;
    await users.insert(track(makeUser({ email })));

    await expect(users.insert(makeUser({ email }))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("updates name, role and password hash", async () => {
    const user = track(makeUser());
    await users.insert(user);

    const updated: User = {
      ...user,
      name: "Renamed User",
      role: "MANAGER",
      passwordHash: "$argon2id$v=19$fake",
      updatedAt: Date.now() + 1,
    };
    await users.update(updated);

    expect(await users.findById(user.id)).toEqual(updated);
  });

  it("rejects an invalid role at the database", async () => {
    const user = track(makeUser());

    await expect(
      users.insert({ ...user, role: "SUPERUSER" as User["role"] }),
    ).rejects.toThrow();
    expect(await users.findById(user.id)).toBeNull();
  });
});
