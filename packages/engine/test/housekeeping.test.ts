// Housekeeping: placeholders, traceability, public API, contract sentence. AC34–AC36.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  areaLoads,
  balance,
  deriveTargets,
  isHardSet,
  localDate,
  normalizeHistory,
  primaryAreas,
  recoveringAreas,
  windowOf,
} from "@workoutlab/engine";

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = path.resolve(ENGINE_DIR, "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const ALL_IDS = [
  "R0-E1",
  "R0-E2",
  "R1-E1",
  "R2-E1",
  "R3-E1",
  "R3-E2",
  "R3-E3",
  "R3-E4",
  "R4-E1",
  "R4-E2",
  "R4-E3",
  "R4-E4",
  "R4-E5",
  "R5-E1",
  "R5-E2",
  "R5-E3",
  "R5-E4",
  "R6-E1",
  "R6-E2",
  "R11-E1",
  "R11-E2",
  "R11-E3",
  "R11-E4",
];

describe("housekeeping", () => {
  it("rule-0 (AC34) no placeholder marker or literal-only expect in packages/engine", () => {
    // Built from parts so this file doesn't match its own search.
    const marker = new RegExp("@" + "placeholder");
    const literal = new RegExp(
      "\\bexpect" + "\\(\\s*(true|1|\"[^\"]*\"|'[^']*'|null|undefined)\\s*\\)",
    );
    const offenders = walk(ENGINE_DIR)
      .filter((f) => /\.(ts|mjs|js|json)$/.test(f))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return marker.test(text) || literal.test(text);
      });
    expect(offenders).toEqual([]);
  });

  it("rule-0 (AC34) each of the 22 example ids appears in an it()/test() title", () => {
    // The ticket says "22 ids", but its list (R0-E1 … R11-E4) expands to these 23; all are checked.
    expect(new Set(ALL_IDS).size).toBe(23);
    const titles: string[] = [];
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    for (const f of walk(path.join(ENGINE_DIR, "test")).filter((p) => p.endsWith(".test.ts"))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(titleRe)) titles.push(m[2] ?? "");
    }
    const missing = ALL_IDS.filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });

  it("rule-0 (AC35) the public API imports from @workoutlab/engine", () => {
    expect(AREAS).toEqual([
      "chest",
      "back",
      "shoulders",
      "arms",
      "core",
      "glutes",
      "quads",
      "hamstrings",
      "calves",
    ]);
    for (const fn of [
      normalizeHistory,
      primaryAreas,
      isHardSet,
      localDate,
      windowOf,
      areaLoads,
      deriveTargets,
      recoveringAreas,
      balance,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });

  it("rule-0 (AC36) rule 0 of engine-rules.md states the equal-edited_at tie-break and cites D-0034", () => {
    const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    const start = doc.indexOf("## 0. Purity and inputs");
    const end = doc.indexOf("## 1. ", start);
    const rule0 = doc.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(rule0).toMatch(/same `client_id` and `edited_at`/);
    expect(rule0).toMatch(/server row beats a queued row/);
    expect(rule0).toMatch(/tombstone beats a live row/);
    expect(rule0).toMatch(/first row in input order wins/);
    expect(rule0).toContain("D-0034");
  });

  it("rule-0 (AC27) engine source never calls localeCompare", () => {
    for (const f of walk(path.join(ENGINE_DIR, "src"))) {
      expect(readFileSync(f, "utf8")).not.toMatch(/localeCompare/);
    }
  });
});
