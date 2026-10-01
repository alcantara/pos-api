import { describe, expect, it } from "vitest";
import { DomainError } from "../errors/domain-error.js";
import { CategoryNotFoundError } from "./category.js";
import { CustomerNotFoundError } from "./customer.js";
import { ProductNotFoundError } from "./product.js";

describe("ProductNotFoundError", () => {
  it("reports the missing id", () => {
    const error = new ProductNotFoundError("p-1");

    expect(error.code).toBe("PRODUCT_NOT_FOUND");
    expect(error.message).toBe("Product p-1 not found");
    expect(error).toBeInstanceOf(DomainError);
  });

  it("falls back to a generic message", () => {
    expect(new ProductNotFoundError().message).toBe("Product not found");
  });
});

describe("CategoryNotFoundError", () => {
  it("reports the missing id", () => {
    expect(new CategoryNotFoundError("c-1").message).toBe("Category c-1 not found");
  });

  it("falls back to a generic message", () => {
    expect(new CategoryNotFoundError().message).toBe("Category not found");
  });
});

describe("CustomerNotFoundError", () => {
  it("reports the missing id", () => {
    expect(new CustomerNotFoundError("x-1").code).toBe("CUSTOMER_NOT_FOUND");
    expect(new CustomerNotFoundError("x-1").message).toBe("Customer x-1 not found");
  });

  it("falls back to a generic message", () => {
    expect(new CustomerNotFoundError().message).toBe("Customer not found");
  });
});
