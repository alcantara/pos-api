import { ConflictError } from "../../domain/errors/domain-error.js";

const MAX_CAUSE_DEPTH = 5;

function collectChain(error: unknown): Error[] {
  const chain: Error[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!(current instanceof Error)) break;
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

function collectCodes(error: unknown): string[] {
  return collectChain(error).flatMap((current) =>
    "code" in current && typeof current.code === "string" ? [current.code] : [],
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return collectCodes(error).some(
    (code) => code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE",
  );
}

const FOREIGN_KEY_CODES = new Set(["23503", "23001", "SQLITE_CONSTRAINT_FOREIGNKEY"]);

export function isForeignKeyViolation(error: unknown): boolean {
  const chain = collectChain(error);
  if (
    chain.some(
      (current) =>
        "code" in current &&
        typeof current.code === "string" &&
        FOREIGN_KEY_CODES.has(current.code),
    )
  ) {
    return true;
  }
  return chain.some((current) => /foreign key/i.test(current.message));
}

export function toConflictError(
  error: unknown,
  messages: { unique?: string; foreignKey?: string },
): ConflictError | undefined {
  if (isUniqueViolation(error)) {
    return new ConflictError(messages.unique ?? "The record already exists");
  }
  if (isForeignKeyViolation(error)) {
    return new ConflictError(
      messages.foreignKey ?? "A referenced record does not exist",
    );
  }
  return undefined;
}
