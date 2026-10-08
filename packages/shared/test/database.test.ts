// T-0102b AC15 (database.gen.ts matches docs/data-model.md) and AC16 (sessions.plan override).
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Json, SessionPlan, Tables, TablesInsert, TablesUpdate } from "../src/index.js";
import { REPO_ROOT } from "./support/spec.js";

const GEN_PATH = path.join(REPO_ROOT, "packages/shared/src/database.gen.ts");
const DOC = readFileSync(path.join(REPO_ROOT, "docs/data-model.md"), "utf8");

type Column = { name: string; type: string; nullable: boolean };

/** Column tables under "## Library" and "## User-owned tables", keyed by `### name`. */
function documentedTables(): Map<string, Column[]> {
  const start = DOC.indexOf("## Library");
  const end = DOC.indexOf("\n## ", DOC.indexOf("## User-owned tables") + 1);
  const body = DOC.slice(start, end);
  const tables = new Map<string, Column[]>();
  for (const section of body.split(/\n### /).slice(1)) {
    const name = section.split(/[\s(]/)[0]!;
    const cols: Column[] = [];
    for (const line of section.split("\n")) {
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length < 5 || cells[1] === "column" || cells[1]?.startsWith("---")) continue;
      const [, col, type, nul] = cells;
      if (!col || !type || (nul !== "yes" && nul !== "no")) continue;
      cols.push({ name: col, type, nullable: nul === "yes" });
    }
    tables.set(name, cols);
  }
  return tables;
}

/** Member type literal by name, e.g. member(Database, "public"). */
function member(node: ts.TypeNode | undefined, name: string): ts.TypeNode | undefined {
  if (!node || !ts.isTypeLiteralNode(node)) return undefined;
  for (const m of node.members) {
    if (ts.isPropertySignature(m) && m.name.getText() === name) return m.type;
  }
  return undefined;
}

function memberNames(node: ts.TypeNode | undefined): string[] {
  if (!node || !ts.isTypeLiteralNode(node)) return [];
  return node.members.filter(ts.isPropertySignature).map((m) => m.name.getText());
}

const source = ts.createSourceFile(
  GEN_PATH,
  readFileSync(GEN_PATH, "utf8"),
  ts.ScriptTarget.ES2022,
  true,
);
const databaseAlias = source.statements.find(
  (s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
);
const db = databaseAlias?.type;
const pub = member(db, "public");

/** `{column: type text}` of `public.<kind>.<name>.Row`. */
function rowOf(kind: "Tables" | "Views", name: string): Map<string, string> {
  const row = member(member(member(pub, kind), name), "Row");
  const out = new Map<string, string>();
  if (row && ts.isTypeLiteralNode(row)) {
    for (const m of row.members) {
      if (ts.isPropertySignature(m) && m.type) out.set(m.name.getText(), m.type.getText());
    }
  }
  return out;
}

const TS_TYPE: Array<[RegExp, string]> = [
  [/^text\[\]$/, "string[]"],
  [/^(text|uuid|timestamptz)$/, "string"],
  [/^(smallint|integer|numeric(\(\d+,\d+\))?)$/, "number"],
  [/^boolean$/, "boolean"],
  [/^jsonb$/, "Json"],
];

function expectedTs(pgType: string): string {
  const hit = TS_TYPE.find(([re]) => re.test(pgType));
  if (!hit) throw new Error(`no TS mapping for ${pgType}`);
  return hit[1];
}

describe("AC15 database.gen.ts matches docs/data-model.md v1", () => {
  const docs = documentedTables();
  const tables = [...docs.entries()].filter(([name]) => name !== "session_sets_live");

  it("parses the documented tables, incl. the v1b tables and the view", () => {
    expect(databaseAlias).toBeDefined();
    expect([...docs.keys()].sort()).toEqual(
      [
        "areas",
        "exercises",
        "exercise_areas",
        "exercise_variants",
        "profiles",
        "area_targets",
        "sessions",
        "session_sets",
        "session_sets_live",
        "routines",
        "routine_items",
        "plan_checkins",
        "excluded_exercises",
      ].sort(),
    );
  });

  it("has exactly the documented tables under public.Tables and the view under Views", () => {
    expect(memberNames(member(pub, "Tables")).sort()).toEqual(tables.map(([n]) => n).sort());
    expect(memberNames(member(pub, "Views"))).toEqual(["session_sets_live"]);
  });

  it.each(tables)("%s: every documented column, with its type and nullability", (name, cols) => {
    const row = rowOf("Tables", name);
    expect([...row.keys()].sort()).toEqual(cols.map((c) => c.name).sort());
    for (const col of cols) {
      const want = expectedTs(col.type) + (col.nullable ? " | null" : "");
      expect({ col: col.name, type: row.get(col.name) }).toEqual({ col: col.name, type: want });
    }
  });

  it("session_sets_live has the columns of session_sets; nullable ones are | null", () => {
    const row = rowOf("Views", "session_sets_live");
    const cols = docs.get("session_sets")!;
    expect([...row.keys()].sort()).toEqual(cols.map((c) => c.name).sort());
    for (const col of cols.filter((c) => c.nullable)) expect(row.get(col.name)).toMatch(/\| null$/);
  });

  it("carries the D-0035 engine columns", () => {
    expect(rowOf("Tables", "exercises").get("kind")).toBe("string");
    expect(rowOf("Tables", "exercises").get("increment_kg")).toBe("number");
    expect(rowOf("Tables", "exercises").get("default_duration_s")).toBe("number | null");
    expect(rowOf("Tables", "exercises").get("external_load")).toBe("boolean");
    expect(rowOf("Tables", "sessions").get("warmup_in_budget")).toBe("boolean");
    expect(rowOf("Tables", "sessions").get("plan")).toBe("Json | null");
    expect(rowOf("Tables", "session_sets").get("backoff")).toBe("boolean");
  });

  it("exposes no analytics schema", () => {
    expect(memberNames(db)).not.toContain("analytics");
    expect(readFileSync(GEN_PATH, "utf8")).not.toMatch(/analytics/);
  });
});

describe("AC16 sessions.plan is SessionPlan | null", () => {
  it("on Row, Insert and Update", () => {
    expectTypeOf<Tables<"sessions">["plan"]>().toEqualTypeOf<SessionPlan | null>();
    expectTypeOf<Required<TablesInsert<"sessions">>["plan"]>().toEqualTypeOf<SessionPlan | null>();
    expectTypeOf<Required<TablesUpdate<"sessions">>["plan"]>().toEqualTypeOf<SessionPlan | null>();
  });

  it("leaves the other sessions columns as generated", () => {
    expectTypeOf<Tables<"sessions">["warmup_in_budget"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Tables<"sessions">["ended_at"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<"session_sets">["backoff"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Tables<"session_sets_live">["backoff"]>().toEqualTypeOf<boolean | null>();
    expectTypeOf<Json>().not.toEqualTypeOf<SessionPlan>();
  });
});

describe("T-0535 AC9 excluded_exercises types (D-0199 §4, UF-11.5)", () => {
  it("Row has the three columns, all required and non-null", () => {
    expectTypeOf<Tables<"excluded_exercises">>().toEqualTypeOf<{
      created_at: string;
      exercise_id: string;
      user_id: string;
    }>();
  });

  it("Insert needs only exercise_id (user_id defaults to auth.uid(), created_at is server-set)", () => {
    expectTypeOf<TablesInsert<"excluded_exercises">>().toEqualTypeOf<{
      created_at?: string;
      exercise_id: string;
      user_id?: string;
    }>();
  });

  it("Update makes every column optional", () => {
    expectTypeOf<TablesUpdate<"excluded_exercises">>().toEqualTypeOf<{
      created_at?: string;
      exercise_id?: string;
      user_id?: string;
    }>();
  });

  it("references exercises through excluded_exercises_exercise_id_fkey", () => {
    expect(readFileSync(GEN_PATH, "utf8")).toContain(
      'foreignKeyName: "excluded_exercises_exercise_id_fkey"',
    );
  });
});
