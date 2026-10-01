import { describe, expect, it } from "vitest";
import {
  API_PREFIX,
  authLinks,
  categoryLinks,
  customerLinks,
  productLinks,
  saleLinks,
  withPage,
  type Links,
} from "../../src/interfaces/http/hateoas.js";

describe("API_PREFIX", () => {
  it("is versioned under /api", () => {
    expect(API_PREFIX).toBe("/api/v1");
  });
});

describe("authLinks", () => {
  it("links self, login and logout", () => {
    expect(authLinks()).toEqual({
      self: { href: "/api/v1/auth/me" },
      login: { href: "/api/v1/auth/login" },
      logout: { href: "/api/v1/auth/logout", method: "POST" },
    });
  });

  it("marks only the state-changing link with a method", () => {
    const methods = Object.values(authLinks()).map((link) => link.method);

    expect(methods).toEqual([undefined, undefined, "POST"]);
  });
});

describe.each([
  ["customerLinks", customerLinks, "/api/v1/customers"],
  ["categoryLinks", categoryLinks, "/api/v1/categories"],
  ["productLinks", productLinks, "/api/v1/products"],
] as const)("%s", (name, build, base) => {
  it(`targets ${base}/{id}`, () => {
    expect(build("abc").self).toEqual({ href: `${base}/abc` });
  });

  it("reuses the same href for self, update and delete", () => {
    const links = build("abc");

    expect(links.update).toEqual({ href: `${base}/abc`, method: "PATCH" });
    expect(links.delete).toEqual({ href: `${base}/abc`, method: "DELETE" });
  });

  it("exposes exactly the three resource links", () => {
    expect(Object.keys(build("abc")).sort()).toEqual(["delete", "self", "update"]);
  });

  it("keeps ids verbatim, including anything url-like", () => {
    // Ids are opaque: the links must not encode, decode or normalise them.
    expect(build("../admin").self).toEqual({ href: `${base}/../admin` });
  });
});

describe("saleLinks", () => {
  it("always exposes self", () => {
    expect(saleLinks("sale-1", "COMPLETED").self).toEqual({
      href: "/api/v1/sales/sale-1",
    });
    expect(saleLinks("sale-1", "CANCELLED").self).toEqual({
      href: "/api/v1/sales/sale-1",
    });
  });

  it("offers cancellation while the sale is COMPLETED", () => {
    const links = saleLinks("sale-1", "COMPLETED");

    expect(links.cancel).toEqual({
      href: "/api/v1/sales/sale-1/cancel",
      method: "POST",
    });
  });

  it("withdraws cancellation once the sale is CANCELLED", () => {
    expect(saleLinks("sale-1", "CANCELLED")).not.toHaveProperty("cancel");
  });

  it("exposes no cancel link for any other status", () => {
    for (const status of ["PENDING", "REFUNDED", "completed", ""]) {
      expect(saleLinks("sale-1", status)).not.toHaveProperty("cancel");
    }
  });

  it("is case sensitive about the status", () => {
    expect(saleLinks("sale-1", "completed")).not.toHaveProperty("cancel");
  });

  it("exposes only self and cancel for a completed sale", () => {
    expect(Object.keys(saleLinks("sale-1", "COMPLETED")).sort()).toEqual([
      "cancel",
      "self",
    ]);
  });
});

describe("withPage", () => {
  it("adds the page parameter to a path", () => {
    expect(withPage("/api/v1/products", 2)).toBe("/api/v1/products?page=2");
  });

  it("keeps existing filters", () => {
    expect(withPage("/api/v1/products?search=coca&limit=10", 3)).toBe(
      "/api/v1/products?search=coca&limit=10&page=3",
    );
  });

  it("replaces an existing page rather than appending a second one", () => {
    expect(withPage("/api/v1/products?page=1", 5)).toBe("/api/v1/products?page=5");
  });

  it("always emits exactly one page parameter", () => {
    const result = withPage("/api/v1/products?page=1&page=2", 4);

    expect(result.match(/[?&]page=/g)).toHaveLength(1);
    expect(result).toContain("page=4");
  });

  it("handles a collection endpoint without a path", () => {
    expect(withPage("/products", 1)).toBe("/products?page=1");
  });

  it("strips the placeholder origin used only to parse relative paths", () => {
    expect(withPage("http://172.20.0.1:3000/api/v1/sales?status=COMPLETED", 2)).toBe(
      "/api/v1/sales?status=COMPLETED&page=2",
    );
  });

  it("does not percent-encode the page value", () => {
    expect(withPage("/api/v1/products", 10)).toBe("/api/v1/products?page=10");
  });

  it("returns a root-relative path for the root collection", () => {
    expect(withPage("/", 1)).toBe("/?page=1");
  });
});

describe("link shape", () => {
  it("never leaks an absolute host, so links survive a deployment move", () => {
    const collections: Links[] = [
      authLinks(),
      customerLinks("c"),
      categoryLinks("c"),
      productLinks("p"),
      saleLinks("s", "COMPLETED"),
      saleLinks("s", "CANCELLED"),
    ];

    for (const links of collections) {
      for (const link of Object.values(links)) {
        expect(link.href.startsWith("/")).toBe(true);
        expect(link.href).not.toContain("://");
      }
    }
  });

  it("keeps every href under the API prefix", () => {
    const hrefs = [
      ...Object.values(authLinks()),
      ...Object.values(customerLinks("c")),
      ...Object.values(categoryLinks("c")),
      ...Object.values(productLinks("p")),
      ...Object.values(saleLinks("s", "COMPLETED")),
    ].map((link) => link.href);

    for (const href of hrefs) {
      expect(href.startsWith(`${API_PREFIX}/`)).toBe(true);
    }
  });
});
