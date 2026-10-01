import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import type { RoleGuard } from "../authz.js";
import { createCategoryController } from "../controllers/category-controller.js";

export function registerCategoryRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
  requireRole: RoleGuard,
): void {
  const controller = createCategoryController(dependencies);
  const read = { preHandler: requireRole() };
  const manage = { preHandler: requireRole("ADMIN", "MANAGER") };

  app.get("/categories", read, controller.list);
  app.post("/categories", manage, controller.create);
  app.get("/categories/:id", read, controller.get);
  app.patch("/categories/:id", manage, controller.update);
  app.delete("/categories/:id", manage, controller.remove);
}
