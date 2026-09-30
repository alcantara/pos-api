import { describe, expect, it } from "vitest";
import { resolveDialect, sqliteFilename } from "./client.js";

describe("resolveDialect", () => {
  it("selects sqlite for file: URLs", () => {
    expect(resolveDialect("file:./dev.db")).toBe("sqlite");
  });

  it("selects sqlite for bare paths", () => {
    expect(resolveDialect("./dev.db")).toBe("sqlite");
    expect(resolveDialect("/var/data/pdv.db")).toBe("sqlite");
  });

  it("selects postgres for postgres URLs", () => {
    expect(resolveDialect("postgres://localhost/pdv")).toBe("postgres");
    expect(resolveDialect("postgresql://localhost/pdv")).toBe("postgres");
  });

  it("rejects unknown protocols", () => {
    expect(() => resolveDialect("mysql://localhost/pdv")).toThrow(
      /Unsupported DATABASE_URL/,
    );
  });
});

describe("sqliteFilename", () => {
  it("strips the file: prefix", () => {
    expect(sqliteFilename("file:./dev.db")).toBe("./dev.db");
  });

  it("keeps bare paths", () => {
    expect(sqliteFilename("./dev.db")).toBe("./dev.db");
  });
});
