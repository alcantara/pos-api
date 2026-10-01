import type { FastifyInstance } from "fastify";
import type { Dependencies } from "../../../application/dependencies.js";
import type { Env } from "../../../config/env.js";
import { createAuthController } from "../controllers/auth-controller.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: Dependencies,
  env: Env,
): void {
  const controller = createAuthController(dependencies, env);

  app.get("/auth/login", controller.login);
  app.get("/auth/callback", controller.callback);
  app.get("/auth/me", controller.me);
  app.post("/auth/logout", controller.logout);
}
