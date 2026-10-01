import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { createDependencies } from "./infrastructure/dependencies.js";
import { registerErrorHandling } from "./interfaces/http/errors.js";
import { API_PREFIX } from "./interfaces/http/hateoas.js";
import { registerAuthRoutes } from "./interfaces/http/routes/auth-routes.js";
import { registerCategoryRoutes } from "./interfaces/http/routes/category-routes.js";
import { registerCustomerRoutes } from "./interfaces/http/routes/customer-routes.js";
import { registerProductRoutes } from "./interfaces/http/routes/product-routes.js";

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const { dependencies, close } = await createDependencies(env);

  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
  });

  app.addHook("onClose", async () => {
    await close();
  });

  registerErrorHandling(app);

  app.get("/health", () => ({ status: "ok" }));

  await app.register(
    (api) => {
      registerProductRoutes(api, dependencies);
      registerCategoryRoutes(api, dependencies);
      registerCustomerRoutes(api, dependencies);
      registerAuthRoutes(api, dependencies, env);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
