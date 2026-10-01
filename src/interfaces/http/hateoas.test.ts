import { describe, expect, it } from "vitest";
import {
  API_PREFIX,
  authLinks,
  categoryLinks,
  customerLinks,
  productLinks,
  withPage,
} from "./hateoas.js";

describe("authLinks", () => {
  it("describes the session endpoints", () => {
    expect(authLinks()).toEqual({
      self: { href: `${API_PREFIX}/auth/me` },
      login: { href: `${API_PREFIX}/auth/login` },
      logout: { href: `${API_PREFIX}/auth/logout`, method: "POST" },
    });
  });
});

describe("resource links", () => {
  it("builds self, update and delete links under the API prefix", () => {
    expect(customerLinks("c-1")).toEqual({
      self: { href: "/api/v1/customers/c-1" },
      update: { href: "/api/v1/customers/c-1", method: "PATCH" },
      delete: { href: "/api/v1/customers/c-1", method: "DELETE" },
    });
    expect(categoryLinks("k-1")).toEqual({
      self: { href: "/api/v1/categories/k-1" },
      update: { href: "/api/v1/categories/k-1", method: "PATCH" },
      delete: { href: "/api/v1/categories/k-1", method: "DELETE" },
    });
    expect(productLinks("p-1")).toEqual({
      self: { href: "/api/v1/products/p-1" },
      update: { href: "/api/v1/products/p-1", method: "PATCH" },
      delete: { href: "/api/v1/products/p-1", method: "DELETE" },
    });
  });
});

describe("withPage", () => {
  it("replaces the page parameter keeping the others", () => {
    expect(withPage("/api/v1/products?limit=10&page=3", 5)).toBe(
      "/api/v1/products?limit=10&page=5",
    );
  });

  it("adds the parameter when missing", () => {
    expect(withPage("/api/v1/products", 2)).toBe("/api/v1/products?page=2");
  });

  it("drops the origin of absolute URLs", () => {
    expect(withPage("http://localhost:3000/api/v1/customers?page=1", 4)).toBe(
      "/api/v1/customers?page=4",
    );
  });
});
