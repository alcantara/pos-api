import type { Dependencies } from "../application/dependencies.js";
import type { Env } from "../config/env.js";
import { RemoteOidcProvider } from "./auth/oidc-provider.js";
import { resolveDialect, sqliteFilename } from "./database/client.js";
import { PostgresDatabase } from "./database/postgres.js";
import { SqliteDatabase } from "./database/sqlite.js";
import { PostgresCategoryRepository } from "./repositories/postgres-category-repository.js";
import { PostgresCustomerRepository } from "./repositories/postgres-customer-repository.js";
import { PostgresProductRepository } from "./repositories/postgres-product-repository.js";
import { PostgresUserRepository } from "./repositories/postgres-user-repository.js";
import { SqliteCategoryRepository } from "./repositories/sqlite-category-repository.js";
import { SqliteCustomerRepository } from "./repositories/sqlite-customer-repository.js";
import { SqliteProductRepository } from "./repositories/sqlite-product-repository.js";
import { SqliteUserRepository } from "./repositories/sqlite-user-repository.js";

export interface CreatedDependencies {
  dependencies: Dependencies;
  /** Releases database connections; wired into Fastify's onClose hook. */
  close: () => Promise<void>;
  /** Underlying handle; exposed for tests that need raw access. */
  database: SqliteDatabase | PostgresDatabase;
}
/**
 * Composition root: selects the dialect from `DATABASE_URL`, applies pending
 * migrations (idempotent) and builds every repository for that dialect.
 */
export async function createDependencies(env: Env): Promise<CreatedDependencies> {
  const dialect = resolveDialect(env.DATABASE_URL);

  // The env schema guarantees the three core OAuth values together.
  const oidc = new RemoteOidcProvider(
    env.OAUTH_ISSUER && env.OAUTH_CLIENT_ID && env.OAUTH_CLIENT_SECRET
      ? {
          issuer: env.OAUTH_ISSUER,
          clientId: env.OAUTH_CLIENT_ID,
          clientSecret: env.OAUTH_CLIENT_SECRET,
          audience: env.OAUTH_AUDIENCE,
        }
      : null,
  );

  if (dialect === "sqlite") {
    const database = new SqliteDatabase(sqliteFilename(env.DATABASE_URL));
    database.migrate();
    const dependencies: Dependencies = {
      products: new SqliteProductRepository(database.context),
      categories: new SqliteCategoryRepository(database.context),
      customers: new SqliteCustomerRepository(database.context),
      users: new SqliteUserRepository(database.context),
      oidc,
    };
    return {
      dependencies,
      database,
      close: () => {
        database.close();
        return Promise.resolve();
      },
    };
  }

  const database = new PostgresDatabase(env.DATABASE_URL);
  await database.migrate();
  const dependencies: Dependencies = {
    products: new PostgresProductRepository(database.context),
    categories: new PostgresCategoryRepository(database.context),
    customers: new PostgresCustomerRepository(database.context),
    users: new PostgresUserRepository(database.context),
    oidc,
  };
  return {
    dependencies,
    database,
    close: async () => database.close(),
  };
}
