import { describe, expect, it } from "vitest";
import { clearCookie, parseCookies, serializeCookie } from "./cookies.js";

describe("serializeCookie", () => {
  it("emits the security flags", () => {
    expect(serializeCookie("pos_session", "abc", { path: "/", secure: false })).toBe(
      "pos_session=abc; Path=/; HttpOnly; SameSite=Lax",
    );
  });

  it("adds Secure and a floored Max-Age when configured", () => {
    expect(
      serializeCookie("pos_oauth", "xyz", {
        path: "/api/v1/auth",
        maxAge: 600.9,
        secure: true,
      }),
    ).toBe(
      "pos_oauth=xyz; Path=/api/v1/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax",
    );
  });
});

describe("clearCookie", () => {
  it("expires the cookie immediately", () => {
    expect(clearCookie("pos_session", { path: "/", secure: false })).toBe(
      "pos_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    );
  });
});

describe("parseCookies", () => {
  it("returns an empty map without a header", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("parses multiple pairs and trims whitespace", () => {
    expect(parseCookies(" a = 1 ; b=2")).toEqual({ a: "1", b: "2" });
  });

  it("keeps the first value when a name repeats", () => {
    expect(parseCookies("a=1; a=2")).toEqual({ a: "1" });
  });

  it("splits on the first equals sign only", () => {
    expect(parseCookies("token=abc=def")).toEqual({ token: "abc=def" });
  });

  it("ignores segments without a separator", () => {
    expect(parseCookies("junk; ok=1")).toEqual({ ok: "1" });
  });

  it("ignores a segment starting with the separator", () => {
    expect(parseCookies("=orphan; ok=1")).toEqual({ ok: "1" });
  });
});
