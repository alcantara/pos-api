import Fastify, { type FastifyInstance } from "fastify";
import type { Dependencies } from "./application/dependencies.js";
import type { Env } from "./config/env.js";
import { createDependencies } from "./infrastructure/dependencies.js";
import { createRoleGuard } from "./interfaces/http/authz.js";
import { registerErrorHandling } from "./interfaces/http/errors.js";
import { API_PREFIX } from "./interfaces/http/hateoas.js";
import { registerAuthRoutes } from "./interfaces/http/routes/auth-routes.js";
import { registerCategoryRoutes } from "./interfaces/http/routes/category-routes.js";
import { registerCustomerRoutes } from "./interfaces/http/routes/customer-routes.js";
import { registerProductRoutes } from "./interfaces/http/routes/product-routes.js";
import { registerSaleRoutes } from "./interfaces/http/routes/sale-routes.js";

export async function buildApp(
  env: Env,
  provided?: Dependencies,
): Promise<FastifyInstance> {
  const { dependencies, close } =
    provided === undefined
      ? await createDependencies(env)
      : { dependencies: provided, close: () => Promise.resolve() };

  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
  });

  app.addHook("onClose", async () => {
    await close();
  });

  registerErrorHandling(app);

  const requireRole = createRoleGuard(dependencies, env.COOKIE_SECRET ?? "");

  app.get("/health", () => ({ status: "ok" }));

  await app.register(
    (api) => {
      registerProductRoutes(api, dependencies, requireRole);
      registerCategoryRoutes(api, dependencies, requireRole);
      registerCustomerRoutes(api, dependencies, requireRole);
      registerSaleRoutes(api, dependencies, requireRole, env);
      registerAuthRoutes(api, dependencies, env);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
