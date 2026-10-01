import { describe, expect, it } from "vitest";
import {
  AuthNotConfiguredError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./domain-error.js";

describe("DomainError", () => {
  it("is an Error carrying a machine-readable code", () => {
    const error = new ValidationError("bad input");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("bad input");
  });

  it("keeps the concrete class name", () => {
    expect(new ConflictError("duplicate").name).toBe("ConflictError");
    expect(new NotFoundError().name).toBe("NotFoundError");
  });
});

describe("NotFoundError", () => {
  it("defaults to a generic message", () => {
    expect(new NotFoundError().code).toBe("NOT_FOUND");
    expect(new NotFoundError().message).toBe("Resource not found");
  });

  it("accepts a specific message", () => {
    expect(new NotFoundError("Sale 1 not found").message).toBe("Sale 1 not found");
  });
});

describe("ValidationError", () => {
  it("exposes its default message", () => {
    const error = new ValidationError();

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Validation failed");
  });
});

describe("UnauthorizedError", () => {
  it("exposes its default message", () => {
    const error = new UnauthorizedError();

    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Authentication required");
  });
});

describe("ForbiddenError", () => {
  it("exposes its default message", () => {
    const error = new ForbiddenError();

    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("Insufficient permissions");
  });

  it("accepts a specific message", () => {
    expect(new ForbiddenError("Role CASHIER cannot manage products").message).toBe(
      "Role CASHIER cannot manage products",
    );
  });
});

describe("AuthNotConfiguredError", () => {
  it("exposes its default message", () => {
    const error = new AuthNotConfiguredError();

    expect(error.code).toBe("AUTH_NOT_CONFIGURED");
    expect(error.message).toBe("Authentication is not configured");
  });
});

describe("ConflictError", () => {
  it("requires a message and reports it verbatim", () => {
    expect(new ConflictError("The name is already taken").message).toBe(
      "The name is already taken",
    );
  });
});
