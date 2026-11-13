// T-0201a: public API, the D-0040 contract sentences and example-id traceability. AC22–AC24.
// T-0201b: the timeCheck / floorInc exports and R7-E11, R7-E12, R8-E1…R8-E3. AC36.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  availableS,
  floorInc,
  generateWarmup,
  isEligible,
  itemCostS,
  rankCandidates,
  suggest,
  timeCheck,
  WARMUP_COST_S,
  type TimeCheckProgress,
  type TimeCheckResult,
} from "@workoutlab/engine";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");

const T0201A_IDS = ["R0-E1", ...Array.from({ length: 10 }, (_, i) => `R7-E${i + 1}`), "R10-E1"];
const T0201B_IDS = ["R7-E11", "R7-E12", "R8-E1", "R8-E2", "R8-E3"];

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
    expect(missingIds(T0201A_IDS)).toEqual([]);
  });
});

describe("T-0201b traceability", () => {
  it("rule-8 (AC36) timeCheck and floorInc are exported from @workoutlab/engine", () => {
    expect(typeof timeCheck).toBe("function");
    expect(typeof floorInc).toBe("function");
    const progress: TimeCheckProgress = { elapsedS: 0, nextItemIndex: 0 };
    const shape: Pick<TimeCheckResult, "show"> = { show: false };
    expect(progress.elapsedS + Number(shape.show)).toBe(0);
  });

  it("rule-8 (AC36) R7-E11, R7-E12 and R8-E1…R8-E3 each appear in a test title", () => {
    expect(missingIds(T0201B_IDS)).toEqual([]);
  });
});

const T0936_IDS = ["R7-E31", "R7-E32", "R7-E33", "R7-E34", "R7-E35", "R7-E36"];

describe("T-0936 traceability (D-0237, D-0239 §14)", () => {
  const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

  it("rule-7 (T-0936) R7-E31…R7-E36 each appear once in rule 7.2 and in a test title", () => {
    const r72 = section(doc, "### 7.2 ", "### 7.3 ");
    for (const id of T0936_IDS) {
      expect(
        r72.split("\n").filter((l) => l.startsWith(`- **${id} `)),
        id,
      ).toHaveLength(1);
    }
    expect(missingIds(T0936_IDS)).toEqual([]);
  });

  it("rule-7 (T-0936) §0, 7.2 steps 1 and 3, 7.3, rule 13, Required tests and one Traceability row name the switches", () => {
    const r0 = section(doc, "## 0. ", "## 1. ");
    const sessionLine = r0.split("\n").find((l) => l.startsWith("- **Session input**"));
    expect(sessionLine).toContain("`autoMainLift` (step 1) and `fill` (step 3) (D-0237, D-0239 §4");
    const r72 = section(doc, "### 7.2 ", "### 7.3 ");
    const step1 = r72.split("\n").find((l) => l.startsWith("1. **Main lift:**"));
    expect(step1).toContain("When `autoMainLift` is `false` there is **no fallback**");
    const step3 = r72.split("\n").find((l) => l.startsWith("3. **Greedy:**"));
    expect(step3).toContain("When `fill` is `false` this step is **skipped**.");
    expect(r72).toContain("- **Switches (UF-08.2 empty mode, D-0237, D-0239 §4, §15):**");
    expect(r72).toContain("Only `=== false` turns a switch off.");
    expect(r72).toContain("is a `RangeError` naming the key");
    expect(r72).toContain("never copied into the `Workout`");
    const r73 = section(doc, "### 7.3 ", "### 7.4 ");
    expect(r73).toContain("When `items` is empty");
    const r13 = section(doc, "## 13. ", "## 14. ");
    expect(r13).toContain("With `fill: false` (rule 7.2)");
    const required = section(doc, "## Required tests", "## Traceability");
    expect(required).toContain("rule-7-switches-histories.test.ts");
    const table = doc.slice(doc.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0936\s*\|$/.test(l))).toHaveLength(1);
  });
});

function missingIds(ids: readonly string[]): string[] {
  const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
  const titles: string[] = [];
  for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
    if (f === path.basename(fileURLToPath(import.meta.url))) continue;
    const text = readFileSync(path.join(TEST_DIR, f), "utf8");
    for (const m of text.matchAll(titleRe)) titles.push(m[2] ?? "");
  }
  return ids.filter((id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)));
}
