// T-0201a: public API, the D-0040 contract sentences and example-id traceability. AC22–AC24.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  availableS,
  generateWarmup,
  isEligible,
  itemCostS,
  rankCandidates,
  suggest,
  WARMUP_COST_S,
} from "@workoutlab/engine";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");

const T0201A_IDS = ["R0-E1", ...Array.from({ length: 10 }, (_, i) => `R7-E${i + 1}`), "R10-E1"];

function section(doc: string, startMarker: string, endMarker: string): string {
  const start = doc.indexOf(startMarker);
  const end = doc.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  return doc.slice(start, end === -1 ? undefined : end);
}

describe("T-0201a traceability", () => {
  it("rule-7 (AC23) the session-building API is exported from @workoutlab/engine", () => {
    for (const fn of [suggest, isEligible, rankCandidates, itemCostS, availableS, generateWarmup]) {
      expect(typeof fn).toBe("function");
    }
    expect(WARMUP_COST_S).toBe(180);
  });

  it("rule-10 (AC24) engine-rules.md carries the D-0040 §6 and §11 sentences", () => {
    const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    const rule10 = section(doc, "## 10. Explanation", "## 11. ");
    expect(rule10).toMatch(
      /`sessionReasons` \(≤ 3\) starts with at most 2 `recovering_skipped \{area\}` entries for the recovering areas in the fixed order, then is filled with `area_deficit` entries for the items' distinct first primary areas, in session order, up to 3 in total \(D-0040\)\./,
    );
    const required = section(doc, "## Required tests", "## Traceability");
    expect(required).toContain(
      "all-chest-no-legs (legs and back get attention, and the main lift is a compound for the first zero-load area (inverted-row), D-0040)",
    );
    expect(required).not.toContain("the main lift is a leg compound");
  });

  it("rule-7 (AC24) R0-E1, R7-E1…R7-E10 and R10-E1 each appear in a test title", () => {
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const titles: string[] = [];
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
      if (f === path.basename(fileURLToPath(import.meta.url))) continue;
      const text = readFileSync(path.join(TEST_DIR, f), "utf8");
      for (const m of text.matchAll(titleRe)) titles.push(m[2] ?? "");
    }
    const missing = T0201A_IDS.filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });
});
