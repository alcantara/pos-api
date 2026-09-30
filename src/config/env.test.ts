import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults when variables are absent", () => {
    const env = loadEnv({ DATABASE_URL: "file:./dev.db" });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.DATABASE_URL).toBe("file:./dev.db");
    expect(env.TEST_POSTGRES_URL).toBeUndefined();
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/Invalid environment configuration/);
  });

  it("coerces PORT to a number", () => {
    expect(loadEnv({ PORT: "8080", DATABASE_URL: "file:./dev.db" }).PORT).toBe(8080);
  });

  it("rejects an out-of-range PORT", () => {
    expect(() => loadEnv({ PORT: "0" })).toThrow(/Invalid environment configuration/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("rejects an empty DATABASE_URL", () => {
    expect(() => loadEnv({ DATABASE_URL: "" })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
