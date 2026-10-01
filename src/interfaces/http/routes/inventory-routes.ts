import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import type { RoleGuard } from "../authz.js";
import { createInventoryController } from "../controllers/inventory-controller.js";

export function registerInventoryRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
  requireRole: RoleGuard,
): void {
  const controller = createInventoryController(dependencies);
  const read = { preHandler: requireRole() };
  const manage = { preHandler: requireRole("ADMIN", "MANAGER") };

  app.get("/inventory/movements", read, controller.listMovements);
  app.post("/inventory/adjustments", manage, controller.adjust);
}
