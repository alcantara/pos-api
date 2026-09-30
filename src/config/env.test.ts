import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults when variables are absent", () => {
    const env = loadEnv({});

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("coerces PORT to a number", () => {
    expect(loadEnv({ PORT: "8080" }).PORT).toBe(8080);
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
