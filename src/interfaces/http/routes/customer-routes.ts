import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { createCustomerController } from "../controllers/customer-controller.js";

export function registerCustomerRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
): void {
  const controller = createCustomerController(dependencies);

  app.get("/customers", controller.list);
  app.post("/customers", controller.create);
  app.get("/customers/:id", controller.get);
  app.patch("/customers/:id", controller.update);
  app.delete("/customers/:id", controller.remove);
}
