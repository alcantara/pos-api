import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { callbackQuerySchema } from "./auth-schemas.js";
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "./category-schemas.js";
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customer-schemas.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductSchema,
} from "./product-schemas.js";

describe("createCategorySchema", () => {
  it("trims the name", () => {
    expect(createCategorySchema.parse({ name: "  Keyboards  " })).toEqual({
      name: "Keyboards",
    });
  });

  it("rejects empty, oversized or unknown fields", () => {
    expect(createCategorySchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: "x".repeat(101) }).success).toBe(
      false,
    );
    expect(createCategorySchema.safeParse({ name: "A", extra: 1 }).success).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("accepts a partial patch", () => {
    expect(updateCategorySchema.parse({ name: "New name" })).toEqual({
      name: "New name",
    });
  });

  it("rejects an empty patch", () => {
    expect(updateCategorySchema.safeParse({}).success).toBe(false);
  });
});

describe("listCategoriesQuerySchema", () => {
  it("applies paging and ordering defaults", () => {
    expect(listCategoriesQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sort: "name",
      order: "asc",
    });
  });

  it("coerces numeric strings", () => {
    expect(listCategoriesQuerySchema.parse({ page: "3", limit: "50" })).toEqual({
      page: 3,
      limit: 50,
      sort: "name",
      order: "asc",
    });
  });

  it("trims and bounds the search term", () => {
    expect(listCategoriesQuerySchema.parse({ search: " pad " }).search).toBe("pad");
    expect(listCategoriesQuerySchema.safeParse({ search: " " }).success).toBe(false);
    expect(
      listCategoriesQuerySchema.safeParse({ search: "x".repeat(101) }).success,
    ).toBe(false);
  });

  it("rejects out-of-range paging and unknown orderings", () => {
    expect(listCategoriesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listCategoriesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listCategoriesQuerySchema.safeParse({ sort: "price" }).success).toBe(false);
    expect(listCategoriesQuerySchema.safeParse({ order: "up" }).success).toBe(false);
  });
});

describe("createProductSchema", () => {
  it("accepts a minimal product and trims text fields", () => {
    expect(
      createProductSchema.parse({
        sku: " SKU-1 ",
        name: " Keyboard ",
        priceCents: 100,
      }),
    ).toEqual({ sku: "SKU-1", name: "Keyboard", priceCents: 100 });
  });

  it("keeps explicit nulls for optional fields", () => {
    expect(
      createProductSchema.parse({
        sku: "SKU-1",
        name: "Keyboard",
        priceCents: 0,
        description: null,
        categoryId: null,
      }),
    ).toEqual({
      sku: "SKU-1",
      name: "Keyboard",
      priceCents: 0,
      description: null,
      categoryId: null,
    });
  });

  it("rejects invalid values", () => {
    const base = { sku: "SKU-1", name: "Keyboard", priceCents: 1 };

    expect(createProductSchema.safeParse({ ...base, priceCents: -1 }).success).toBe(
      false,
    );
    expect(createProductSchema.safeParse({ ...base, priceCents: 1.5 }).success).toBe(
      false,
    );
    expect(createProductSchema.safeParse({ ...base, stockQuantity: -2 }).success).toBe(
      false,
    );
    expect(
      createProductSchema.safeParse({ ...base, categoryId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(createProductSchema.safeParse({ ...base, color: "red" }).success).toBe(
      false,
    );
  });
});

describe("updateProductSchema", () => {
  it("accepts a partial patch", () => {
    expect(updateProductSchema.parse({ priceCents: 500 })).toEqual({ priceCents: 500 });
  });

  it("rejects an empty patch", () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
  });
});

describe("listProductsQuerySchema", () => {
  it("applies defaults", () => {
    expect(listProductsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sort: "name",
      order: "asc",
    });
  });

  it("accepts every sort field", () => {
    expect(listProductsQuerySchema.parse({ sort: "price", order: "desc" })).toEqual({
      page: 1,
      limit: 20,
      sort: "price",
      order: "desc",
    });
    expect(listProductsQuerySchema.parse({ sort: "createdAt" }).sort).toBe("createdAt");
  });

  it("rejects out-of-range paging and unknown sorts", () => {
    expect(listProductsQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ sort: "sku" }).success).toBe(false);
  });
});

describe("createCustomerSchema", () => {
  it("trims the contact fields", () => {
    expect(
      createCustomerSchema.parse({
        name: " Ana ",
        email: "ana@acme.test",
        phone: " 555-1234 ",
      }),
    ).toEqual({ name: "Ana", email: "ana@acme.test", phone: "555-1234" });
  });

  it("accepts null contact fields", () => {
    expect(
      createCustomerSchema.parse({ name: "Ana", email: null, phone: null }),
    ).toEqual({ name: "Ana", email: null, phone: null });
  });

  it("rejects malformed values", () => {
    expect(
      createCustomerSchema.safeParse({ name: "Ana", email: "not-an-email" }).success,
    ).toBe(false);
    expect(createCustomerSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: "Ana", phone: "" }).success).toBe(
      false,
    );
    expect(createCustomerSchema.safeParse({ name: "Ana", extra: true }).success).toBe(
      false,
    );
  });
});

describe("updateCustomerSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateCustomerSchema.safeParse({}).success).toBe(false);
  });
});

describe("listCustomersQuerySchema", () => {
  it("applies defaults", () => {
    expect(listCustomersQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sort: "name",
      order: "asc",
    });
  });

  it("rejects unknown sort fields", () => {
    expect(listCustomersQuerySchema.safeParse({ sort: "email" }).success).toBe(false);
  });
});

describe("resource id params", () => {
  it("accepts UUIDs", () => {
    const id = randomUUID();

    expect(categoryIdParamsSchema.parse({ id })).toEqual({ id });
    expect(productIdParamsSchema.parse({ id })).toEqual({ id });
    expect(customerIdParamsSchema.parse({ id })).toEqual({ id });
  });

  it("rejects non-UUIDs", () => {
    expect(categoryIdParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
    expect(productIdParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
    expect(customerIdParamsSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("callbackQuerySchema", () => {
  it("accepts a code with its state", () => {
    expect(callbackQuerySchema.parse({ code: "c", state: "s" })).toEqual({
      code: "c",
      state: "s",
    });
  });

  it("accepts an error response", () => {
    expect(callbackQuerySchema.parse({ error: "access_denied" })).toEqual({
      error: "access_denied",
    });
  });

  it("rejects partial or empty queries", () => {
    expect(callbackQuerySchema.safeParse({}).success).toBe(false);
    expect(callbackQuerySchema.safeParse({ code: "c" }).success).toBe(false);
    expect(callbackQuerySchema.safeParse({ state: "s" }).success).toBe(false);
  });
});
