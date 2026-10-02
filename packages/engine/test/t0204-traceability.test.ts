// T-0204 UF-08.2 UF-08.3 UF-05.1: the D-0056 §1 R12-E1 correction, the public API and
// purity/traceability for rules 12–13. AC25–AC27.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import { muscleMatch, rankSwaps, type SwapCandidate } from "@workoutlab/engine";
import { R12_E1_LINE } from "./fixtures/r12-e1-d0056.js";
import { rule12Slice, rulesOnMain, t0204GuardOk } from "./rule12-guards.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(TEST_DIR, "..");
const REPO_DIR = path.resolve(ENGINE_DIR, "..", "..");
const RULES = path.join(REPO_DIR, "docs", "engine-rules.md");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe("T-0204 contract edit (D-0056 §1)", () => {
  it("R12-E1 rule-12 (AC25) the R12-E1 line says muscleMatch 1.0 and 0.667 and cites D-0056", () => {
    const lines = readFileSync(RULES, "utf8").split("\n");
    // The exact id: R12-E10 and R12-E11 (T-0224, D-0093) share the "R12-E1" prefix.
    const e1 = lines.filter((l) => /^- \*\*R12-E1(?!\d)/.test(l));
    expect(e1).toEqual([R12_E1_LINE.after]);
    const line = e1[0] ?? "";
    expect(line).toContain("muscleMatch 1.0");
    expect(line).toContain("0.667");
    expect(line).toContain("D-0056");
    // 0.667 now belongs to straight-arm-pulldown only, never to db-row.
    expect(line).toMatch(
      /seated-cable-row \(muscleMatch 1\.0\), then straight-arm-pulldown \(0\.667\)/,
    );
    expect(line.indexOf("db-row")).toBeLessThan(line.indexOf("1.0"));
    expect(line.indexOf("0.667")).toBeGreaterThan(line.indexOf("straight-arm-pulldown"));
    // The listed order is unchanged.
    const order = [
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ];
    const at = order.map((id) => line.indexOf(id));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(lines).not.toContain(R12_E1_LINE.before);
  });

  it("rule-12 (AC25) against main, rule 12 (to R12-E5) and rule 13 differ by at most that one line", () => {
    const current = readFileSync(RULES, "utf8");
    const main = rulesOnMain(REPO_DIR);
    // Shallow CI clones have no main; the fixture test above still pins the line.
    if (main === null) return;
    // D-0092 §6: the guard covers the sections T-0204 owned, not the whole file.
    expect(() => rule12Slice(current)).not.toThrow();
    expect(() => rule12Slice(main)).not.toThrow();
    // D-0056 §1 (R12-E1) and D-0130 §1 (the signature line) are the only accepted edits.
    expect(t0204GuardOk(current, main)).toBe(true);
  });
});

describe("T-0204 public API", () => {
  it("rule-12 (AC26) rankSwaps, muscleMatch and SwapCandidate are exported; SwapCandidate is the openapi shape", () => {
    expect(typeof rankSwaps).toBe("function");
    expect(typeof muscleMatch).toBe("function");
    expectTypeOf<SwapCandidate>().toEqualTypeOf<{
      exerciseId: string;
      muscleMatch: number;
      timeCostS: number;
      equipment: string[];
      fitsBudget: boolean;
      bestMatch: boolean;
    }>();
    const openapi = readFileSync(path.join(REPO_DIR, "api", "openapi.yaml"), "utf8");
    const start = openapi.indexOf("\n    SwapCandidate:");
    expect(start).toBeGreaterThan(-1);
    const block = openapi.slice(start, openapi.indexOf("\n    SwapCandidateList:", start));
    expect(block).toMatch(
      /required:\s*\[\s*exerciseId,\s*muscleMatch,\s*timeCostS,\s*equipment,\s*fitsBudget,\s*bestMatch\s*\]/,
    );
    expect(block).toMatch(/additionalProperties: false/);
  });
});

describe("T-0204 purity and traceability", () => {
  it("rule-13 (AC27) packages/engine/src never mentions random, Date.now or a bare new Date()", () => {
    const files = walk(path.join(ENGINE_DIR, "src"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text.match(/random/gi) ?? [], f).toEqual([]);
      expect(text.match(/Date\.now\s*\(/g) ?? [], f).toEqual([]);
      expect(text.match(/new Date\(\s*\)/g) ?? [], f).toEqual([]);
    }
  });

  it("rule-12 rule-13 (AC27) R12-E1…R12-E5, R13-E1 and R13-E2 each appear in a test title", () => {
    const ids = ["R12-E1", "R12-E2", "R12-E3", "R12-E4", "R12-E5", "R13-E1", "R13-E2"];
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const titles: string[] = [];
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
      if (f === path.basename(fileURLToPath(import.meta.url))) continue;
      for (const m of readFileSync(path.join(TEST_DIR, f), "utf8").matchAll(titleRe)) {
        titles.push(m[2] ?? "");
      }
    }
    const missing = ids.filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });
});
