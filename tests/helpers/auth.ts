import { randomUUID } from "node:crypto";
import type { FastifyInstance, InjectOptions } from "fastify";
import { createSessionToken } from "../../src/application/auth/session.js";
import type { Dependencies } from "../../src/application/dependencies.js";
import { loadEnv } from "../../src/config/env.js";
import type { Role, User } from "../../src/domain/entities/user.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";
import { buildApp } from "../../src/app.js";

export const TEST_COOKIE_SECRET = "s".repeat(48);

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

export interface AuthenticatedApp {
  app: FastifyInstance;
  dependencies: Dependencies;
  users: Record<Role, User>;
  cookie(role: Role): string;
  inject(options: InjectOptions, role?: Role): Promise<InjectResponse>;
  injectAnonymous(options: InjectOptions): Promise<InjectResponse>;
}

function seededUser(role: Role, now: number): User {
  return {
    id: randomUUID(),
    email: `${role.toLowerCase()}@test.pos`,
    name: `Test ${role}`,
    passwordHash: null,
    role,
    createdAt: now,
    updatedAt: now,
  };
}

export async function buildAuthenticatedApp(
  databaseUrl = "file::memory:",
): Promise<AuthenticatedApp> {
  const env = loadEnv({
    NODE_ENV: "test",
    PORT: "3000",
    LOG_LEVEL: "silent",
    DATABASE_URL: databaseUrl,
    COOKIE_SECRET: TEST_COOKIE_SECRET,
  });

  const { dependencies, close } = await createDependencies(env);
  const now = Date.now();
  const users: Record<Role, User> = {
    ADMIN: seededUser("ADMIN", now),
    MANAGER: seededUser("MANAGER", now),
    CASHIER: seededUser("CASHIER", now),
  };
  for (const user of Object.values(users)) {
    await dependencies.users.insert(user);
  }

  const app = await buildApp(env, dependencies);
  app.addHook("onClose", async () => {
    await close();
  });

  const cookie = (role: Role): string =>
    `pos_session=${createSessionToken(users[role].id, TEST_COOKIE_SECRET)}`;

  return {
    app,
    dependencies,
    users,
    cookie,
    inject: (options, role = "MANAGER") =>
      app.inject({
        ...options,
        headers: { ...options.headers, cookie: cookie(role) },
      }),
    injectAnonymous: (options) => app.inject(options),
  };
}
