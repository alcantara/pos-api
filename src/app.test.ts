import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

function makeApp() {
  return buildApp(
    loadEnv({
      NODE_ENV: "test",
      PORT: "3000",
      LOG_LEVEL: "silent",
      DATABASE_URL: "file::memory:",
    }),
  );
}

describe("buildApp", () => {
  it("responds to GET /health", async () => {
    const app = makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("returns 404 for unknown routes", async () => {
    const app = makeApp();
    const response = await app.inject({
      method: "GET",
      url: "/does-not-exist",
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
