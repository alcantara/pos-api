import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";

export function buildApp(env: Env): FastifyInstance {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.LOG_LEVEL,
          },
  });

  app.get("/health", () => ({ status: "ok" }));

  return app;
}
