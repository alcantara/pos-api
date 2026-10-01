import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import type { Env } from "../../../config/env.js";
import type { RoleGuard } from "../authz.js";
import { createSaleController } from "../controllers/sale-controller.js";

export function registerSaleRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
  requireRole: RoleGuard,
  env: Env,
): void {
  const controller = createSaleController(dependencies, env.COOKIE_SECRET ?? "");
  const sell = { preHandler: requireRole() };
  const manage = { preHandler: requireRole("ADMIN", "MANAGER") };

  app.get("/sales", sell, controller.list);
  app.post("/sales", sell, controller.create);
  app.get("/sales/:id", sell, controller.get);
  app.post("/sales/:id/cancel", manage, controller.cancel);
}
