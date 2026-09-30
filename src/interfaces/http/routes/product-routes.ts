import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { createProductController } from "../controllers/product-controller.js";

export function registerProductRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
): void {
  const controller = createProductController(dependencies);

  app.get("/products", controller.list);
  app.post("/products", controller.create);
  app.get("/products/:id", controller.get);
  app.patch("/products/:id", controller.update);
  app.delete("/products/:id", controller.remove);
}
