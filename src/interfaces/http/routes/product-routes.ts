import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import type { RoleGuard } from "../authz.js";
import { createProductController } from "../controllers/product-controller.js";

export function registerProductRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
  requireRole: RoleGuard,
): void {
  const controller = createProductController(dependencies);
  const read = { preHandler: requireRole() };
  const manage = { preHandler: requireRole("ADMIN", "MANAGER") };

  app.get("/products", read, controller.list);
  app.post("/products", manage, controller.create);
  app.get("/products/:id", read, controller.get);
  app.patch("/products/:id", manage, controller.update);
  app.delete("/products/:id", manage, controller.remove);
}
