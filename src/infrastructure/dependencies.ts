import type { Dependencies } from "../application/dependencies.js";
import type { Env } from "../config/env.js";
import { resolveDialect, sqliteFilename } from "./database/client.js";
import { PostgresDatabase } from "./database/postgres.js";
import { SqliteDatabase } from "./database/sqlite.js";
import { PostgresProductRepository } from "./repositories/postgres-product-repository.js";
import { SqliteProductRepository } from "./repositories/sqlite-product-repository.js";

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

  if (dialect === "sqlite") {
    const database = new SqliteDatabase(sqliteFilename(env.DATABASE_URL));
    database.migrate();
    const dependencies: Dependencies = {
      products: new SqliteProductRepository(database.context),
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
  };
  return {
    dependencies,
    database,
    close: async () => database.close(),
  };
}
