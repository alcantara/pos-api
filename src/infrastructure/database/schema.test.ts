import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import * as pgSchema from "./schema/postgres.js";
import * as sqliteSchema from "./schema/sqlite.js";

describe("schema parity", () => {
  const sqliteTables = Object.entries(sqliteSchema) as [string, Table][];
  const pgTables = Object.entries(pgSchema) as [string, Table][];

  it("defines the same tables in both dialects", () => {
    expect(pgTables.map(([name]) => name).sort()).toEqual(
      sqliteTables.map(([name]) => name).sort(),
    );
  });

  it.each(sqliteTables)("defines the same columns for %s", (name, table) => {
    const pgEntry = pgTables.find(([pgName]) => pgName === name);
    expect(pgEntry).toBeDefined();
    expect(getTableName(table)).toEqual(getTableName(pgEntry![1]));
    expect(Object.keys(getTableColumns(pgEntry![1]))).toEqual(
      Object.keys(getTableColumns(table)),
    );
  });
});
