// @vitest-environment node
// T-0505 AC-4/AC-5 (UF-11.4, D-0190, NFR-PRIV-4): EXPORT_TABLES must equal the literal owned-table
// list that pgTAP 018 proves against the live catalog.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXPORT_TABLES } from "../export.js";

const SQL = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../supabase/tests/database/018_user_owned_tables.test.sql",
);

export function ownedTables(sql: string, file: string): string[] {
  const begin = sql.indexOf("-- OWNED_TABLES:BEGIN");
  const end = sql.indexOf("-- OWNED_TABLES:END");
  if (begin < 0 || end < begin) {
    throw new Error(`${file}: missing -- OWNED_TABLES:BEGIN / -- OWNED_TABLES:END markers`);
  }
  const names = sql
    .slice(begin, end)
    .split("\n")
    .slice(1)
    .filter((l) => !l.trim().startsWith("--"))
    .flatMap((l) => [...l.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1] as string));
  if (names.length === 0) throw new Error(`${file}: the OWNED_TABLES list is empty`);
  return names.sort();
}

describe("T-0505 export tables drift", () => {
  it("T-0505 AC-4 EXPORT_TABLES equals the OWNED_TABLES list in 018", () => {
    const owned = ownedTables(readFileSync(SQL, "utf8"), SQL);
    expect([...EXPORT_TABLES].sort()).toEqual(owned);
  });

  it("T-0505 AC-4 the parser ignores comment lines inside the markers", () => {
    const sql = "-- OWNED_TABLES:BEGIN\n  -- x\n  ('b'),\n  ('a')\n-- OWNED_TABLES:END";
    expect(ownedTables(sql, "f.sql")).toEqual(["a", "b"]);
  });

  it("T-0505 AC-5 missing markers fail, naming the file", () => {
    expect(() => ownedTables("select 1;", "018.sql")).toThrow(/018\.sql.*markers/);
  });
});
