import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import type { RoleGuard } from "../authz.js";
import { createCustomerController } from "../controllers/customer-controller.js";

export function registerCustomerRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
  requireRole: RoleGuard,
): void {
  const controller = createCustomerController(dependencies);
  const read = { preHandler: requireRole() };
  const manage = { preHandler: requireRole("ADMIN", "MANAGER") };

  app.get("/customers", read, controller.list);
  app.post("/customers", manage, controller.create);
  app.get("/customers/:id", read, controller.get);
  app.patch("/customers/:id", manage, controller.update);
  app.delete("/customers/:id", manage, controller.remove);
}
