import { describe, expect, it } from "vitest";
import type { Category } from "../../../domain/entities/category.js";
import type { Customer } from "../../../domain/entities/customer.js";
import type { Product } from "../../../domain/entities/product.js";
import type { User } from "../../../domain/entities/user.js";
import { categoryRepresentation } from "./category-mapper.js";
import { customerRepresentation } from "./customer-mapper.js";
import { productRepresentation } from "./product-mapper.js";
import { userRepresentation } from "./user-mapper.js";

const CREATED = 1700000000000;
const CREATED_ISO = "2023-11-14T22:13:20.000Z";
const UPDATED = 1700000061000;
const UPDATED_ISO = "2023-11-14T22:14:21.000Z";

const product: Product = {
  id: "p-1",
  sku: "SKU-1",
  name: "Keyboard",
  description: "Mechanical",
  priceCents: 12990,
  stockQuantity: 7,
  categoryId: "k-1",
  createdAt: CREATED,
  updatedAt: UPDATED,
};

describe("productRepresentation", () => {
  it("converts timestamps to ISO and attaches links", () => {
    expect(productRepresentation(product)).toEqual({
      id: "p-1",
      sku: "SKU-1",
      name: "Keyboard",
      description: "Mechanical",
      priceCents: 12990,
      stockQuantity: 7,
      categoryId: "k-1",
      createdAt: CREATED_ISO,
      updatedAt: UPDATED_ISO,
      _links: {
        self: { href: "/api/v1/products/p-1" },
        update: { href: "/api/v1/products/p-1", method: "PATCH" },
        delete: { href: "/api/v1/products/p-1", method: "DELETE" },
      },
    });
  });

  it("keeps nullable fields as null", () => {
    const representation = productRepresentation({
      ...product,
      description: null,
      categoryId: null,
    });

    expect(representation.description).toBeNull();
    expect(representation.categoryId).toBeNull();
  });
});

describe("categoryRepresentation", () => {
  it("converts timestamps to ISO and attaches links", () => {
    const category: Category = {
      id: "k-1",
      name: "Keyboards",
      createdAt: CREATED,
      updatedAt: UPDATED,
    };

    expect(categoryRepresentation(category)).toEqual({
      id: "k-1",
      name: "Keyboards",
      createdAt: CREATED_ISO,
      updatedAt: UPDATED_ISO,
      _links: {
        self: { href: "/api/v1/categories/k-1" },
        update: { href: "/api/v1/categories/k-1", method: "PATCH" },
        delete: { href: "/api/v1/categories/k-1", method: "DELETE" },
      },
    });
  });
});

describe("customerRepresentation", () => {
  it("maps contact fields including nulls", () => {
    const customer: Customer = {
      id: "c-1",
      name: "Ana",
      email: null,
      phone: null,
      createdAt: CREATED,
      updatedAt: CREATED,
    };

    expect(customerRepresentation(customer)).toEqual({
      id: "c-1",
      name: "Ana",
      email: null,
      phone: null,
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
      _links: {
        self: { href: "/api/v1/customers/c-1" },
        update: { href: "/api/v1/customers/c-1", method: "PATCH" },
        delete: { href: "/api/v1/customers/c-1", method: "DELETE" },
      },
    });
  });
});

describe("userRepresentation", () => {
  it("maps the role with shared auth links and no secrets", () => {
    const user: User = {
      id: "u-1",
      email: "ana@acme.test",
      name: "Ana",
      passwordHash: null,
      role: "CASHIER",
      createdAt: CREATED,
      updatedAt: CREATED,
    };

    expect(userRepresentation(user)).toEqual({
      id: "u-1",
      email: "ana@acme.test",
      name: "Ana",
      role: "CASHIER",
      createdAt: CREATED_ISO,
      updatedAt: CREATED_ISO,
      _links: {
        self: { href: "/api/v1/auth/me" },
        login: { href: "/api/v1/auth/login" },
        logout: { href: "/api/v1/auth/logout", method: "POST" },
      },
    });
  });
});
