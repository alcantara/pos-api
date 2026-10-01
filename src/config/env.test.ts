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

  it("treats empty OAuth values as unset", () => {
    const env = loadEnv({
      DATABASE_URL: "file:./dev.db",
      OAUTH_ISSUER: "",
      OAUTH_CLIENT_ID: "",
      COOKIE_SECRET: "",
    });

    expect(env.OAUTH_ISSUER).toBeUndefined();
    expect(env.OAUTH_CLIENT_ID).toBeUndefined();
    expect(env.COOKIE_SECRET).toBeUndefined();
  });

  it("rejects a partially configured OAuth set", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "file:./dev.db",
        OAUTH_ISSUER: "https://idp.test",
      }),
    ).toThrow(/OAUTH_CLIENT_ID/);
  });

  it("accepts a complete OAuth configuration", () => {
    const env = loadEnv({
      DATABASE_URL: "file:./dev.db",
      OAUTH_ISSUER: "https://idp.test",
      OAUTH_CLIENT_ID: "pos-client",
      OAUTH_CLIENT_SECRET: "secret",
      OAUTH_AUDIENCE: "pos-api",
      OAUTH_REDIRECT_URI: "https://api.test/api/v1/auth/callback",
      COOKIE_SECRET: "x".repeat(48),
    });

    expect(env.OAUTH_ISSUER).toBe("https://idp.test");
    expect(env.COOKIE_SECRET).toHaveLength(48);
  });

  it("rejects an invalid OAUTH_ISSUER URL", () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: "file:./dev.db",
        OAUTH_ISSUER: "not-a-url",
        OAUTH_CLIENT_ID: "pos-client",
        OAUTH_CLIENT_SECRET: "secret",
      }),
    ).toThrow(/OAUTH_ISSUER/);
  });

  it("rejects a short COOKIE_SECRET", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "file:./dev.db", COOKIE_SECRET: "short" }),
    ).toThrow(/COOKIE_SECRET/);
  });
});
