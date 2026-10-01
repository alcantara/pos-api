import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import { createCategoryController } from "../controllers/category-controller.js";

export function registerCategoryRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
): void {
  const controller = createCategoryController(dependencies);

  app.get("/categories", controller.list);
  app.post("/categories", controller.create);
  app.get("/categories/:id", controller.get);
  app.patch("/categories/:id", controller.update);
  app.delete("/categories/:id", controller.remove);
}
