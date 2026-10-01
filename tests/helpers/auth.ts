import { randomUUID } from "node:crypto";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../../src/app.js";
import { createSessionToken } from "../../src/application/auth/session.js";
import type { Dependencies } from "../../src/application/dependencies.js";
import { loadEnv } from "../../src/config/env.js";
import type { Role, User } from "../../src/domain/entities/user.js";
import { createDependencies } from "../../src/infrastructure/dependencies.js";

export const TEST_COOKIE_SECRET = "s".repeat(48);
export const TEST_CSRF_TOKEN = "t".repeat(64);
export const CSRF_HEADER = "x-csrf-token";

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
  options: { databaseUrl?: string; csrfProtection?: boolean } = {},
): Promise<AuthenticatedApp> {
  const env = loadEnv({
    NODE_ENV: "test",
    PORT: "3000",
    LOG_LEVEL: "silent",
    DATABASE_URL: options.databaseUrl ?? "file::memory:",
    COOKIE_SECRET: TEST_COOKIE_SECRET,
    CSRF_PROTECTION: options.csrfProtection === false ? "false" : "true",
    RATE_LIMIT_MAX: "100000",
  });

  const csrfEnabled = options.csrfProtection !== false;

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
    `pos_session=${createSessionToken(users[role].id, TEST_COOKIE_SECRET)}` +
    (csrfEnabled ? `; pos_csrf=${TEST_CSRF_TOKEN}` : "");

  const withCsrf = (headers: InjectOptions["headers"]): Record<string, string> => {
    const base: Record<string, string> = {};
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === "string") base[key] = value;
      }
    }
    if (csrfEnabled) base[CSRF_HEADER] = TEST_CSRF_TOKEN;
    return base;
  };

  return {
    app,
    dependencies,
    users,
    cookie,
    inject: (options, role = "MANAGER") =>
      app.inject({
        ...options,
        headers: { ...withCsrf(options.headers), cookie: cookie(role) },
      }),
    injectAnonymous: (options) => app.inject(options),
  };
}
