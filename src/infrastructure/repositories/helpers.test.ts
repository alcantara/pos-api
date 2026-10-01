import { describe, expect, it } from "vitest";
import { ConflictError } from "../../domain/errors/domain-error.js";
import {
  isForeignKeyViolation,
  isUniqueViolation,
  toConflictError,
} from "./db-errors.js";
import { containsPattern, escapeLikePattern } from "./like.js";

function codedError(code: string, message = "db failure"): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("escapeLikePattern", () => {
  it("escapes backslash, percent and underscore", () => {
    expect(escapeLikePattern("a\\b%c_d")).toBe("a\\\\b\\%c\\_d");
  });

  it("leaves other characters untouched", () => {
    expect(escapeLikePattern("SKU-123 x")).toBe("SKU-123 x");
  });
});

describe("containsPattern", () => {
  it("wraps the value in wildcards", () => {
    expect(containsPattern("keyboard")).toBe("%keyboard%");
  });

  it("keeps metacharacters literal inside the wildcards", () => {
    expect(containsPattern("50%")).toBe("%50\\%%");
    expect(containsPattern("a_b")).toBe("%a\\_b%");
  });
});

describe("isUniqueViolation", () => {
  it("recognises PostgreSQL and SQLite codes", () => {
    expect(isUniqueViolation(codedError("23505"))).toBe(true);
    expect(isUniqueViolation(codedError("SQLITE_CONSTRAINT_UNIQUE"))).toBe(true);
  });

  it("finds the code in the cause chain", () => {
    const error = new Error("wrapped", {
      cause: new Error("inner", { cause: codedError("23505") }),
    });

    expect(isUniqueViolation(error)).toBe(true);
  });

  it("reads codes within the depth limit", () => {
    let error: unknown = codedError("23505");
    for (let level = 0; level < 4; level += 1) {
      error = new Error(`level ${level}`, { cause: error });
    }

    expect(isUniqueViolation(error)).toBe(true);
  });

  it("ignores codes beyond the depth limit", () => {
    let error: unknown = codedError("23505");
    for (let level = 0; level < 5; level += 1) {
      error = new Error(`level ${level}`, { cause: error });
    }

    expect(isUniqueViolation(error)).toBe(false);
  });

  it("rejects unrelated or non-error values", () => {
    expect(isUniqueViolation(codedError("23503"))).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation("not an error")).toBe(false);
  });
});

describe("isForeignKeyViolation", () => {
  it("recognises dialect codes", () => {
    expect(isForeignKeyViolation(codedError("23503"))).toBe(true);
    expect(isForeignKeyViolation(codedError("23001"))).toBe(true);
    expect(isForeignKeyViolation(codedError("SQLITE_CONSTRAINT_FOREIGNKEY"))).toBe(
      true,
    );
  });

  it("falls back to the message case-insensitively", () => {
    expect(isForeignKeyViolation(new Error("violates FOREIGN KEY constraint"))).toBe(
      true,
    );
    expect(isForeignKeyViolation(new Error("foreign key constraint failed"))).toBe(
      true,
    );
  });

  it("rejects unrelated errors", () => {
    expect(isForeignKeyViolation(codedError("23505"))).toBe(false);
    expect(isForeignKeyViolation(new Error("connection refused"))).toBe(false);
  });
});

describe("toConflictError", () => {
  it("maps unique violations with the given message", () => {
    const error = toConflictError(codedError("23505"), {
      unique: "The SKU is already taken",
    });

    expect(error).toBeInstanceOf(ConflictError);
    expect(error?.message).toBe("The SKU is already taken");
  });

  it("maps foreign key violations with the given message", () => {
    const error = toConflictError(codedError("23503"), {
      foreignKey: "The customer cannot be deleted while sales reference them",
    });

    expect(error?.message).toBe(
      "The customer cannot be deleted while sales reference them",
    );
  });

  it("falls back to generic messages", () => {
    expect(toConflictError(codedError("23505"), {})?.message).toBe(
      "The record already exists",
    );
    expect(toConflictError(codedError("23503"), {})?.message).toBe(
      "A referenced record does not exist",
    );
  });

  it("returns undefined for other errors", () => {
    expect(toConflictError(new Error("boom"), {})).toBeUndefined();
  });
});
