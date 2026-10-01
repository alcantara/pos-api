import Fastify, { type FastifyInstance } from "fastify";
import type { Dependencies } from "./application/dependencies.js";
import type { Env } from "./config/env.js";
import { loadSecurityConfig } from "./config/security.js";
import { createDependencies } from "./infrastructure/dependencies.js";
import { createRoleGuard } from "./interfaces/http/authz.js";
import { CSRF_COOKIE } from "./interfaces/http/cookies.js";
import {
  createRateLimiter,
  registerErrorHandling,
  registerRateLimit,
} from "./interfaces/http/errors.js";
import { API_PREFIX } from "./interfaces/http/hateoas.js";
import { registerAuthRoutes } from "./interfaces/http/routes/auth-routes.js";
import { registerCategoryRoutes } from "./interfaces/http/routes/category-routes.js";
import { registerCustomerRoutes } from "./interfaces/http/routes/customer-routes.js";
import { registerInventoryRoutes } from "./interfaces/http/routes/inventory-routes.js";
import { registerProductRoutes } from "./interfaces/http/routes/product-routes.js";
import { registerSaleRoutes } from "./interfaces/http/routes/sale-routes.js";
import {
  registerCors,
  registerCsrfProtection,
  registerSecurityHeaders,
} from "./interfaces/http/security.js";

export async function buildApp(
  env: Env,
  provided?: Dependencies,
): Promise<FastifyInstance> {
  const { dependencies, close } =
    provided === undefined
      ? await createDependencies(env)
      : { dependencies: provided, close: () => Promise.resolve() };

  const security = loadSecurityConfig(process.env);
  const isProduction = env.NODE_ENV === "production";

  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.LOG_LEVEL },
    bodyLimit: 1_048_576,
    trustProxy: isProduction,
  });

  app.addHook("onClose", async () => {
    await close();
  });

  registerSecurityHeaders(app, { hsts: isProduction });
  if (security.corsOrigins) {
    registerCors(app, security.corsOrigins);
  }
  registerCsrfProtection(app, {
    cookieName: CSRF_COOKIE,
    enabled: security.csrfProtection,
  });
  registerRateLimit(app, {
    limiter: createRateLimiter(security.rateLimitMax, security.rateLimitWindowMs),
    max: security.rateLimitMax,
    skip: (request) => request.url === "/health",
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
      registerInventoryRoutes(api, dependencies, requireRole);
      registerAuthRoutes(api, dependencies, env);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
