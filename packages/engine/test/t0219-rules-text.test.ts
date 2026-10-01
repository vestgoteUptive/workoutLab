// T-0219 UF-08.2 UF-09.5: the rule 7.1 contract text added under D-0092 §5 (AC13). Per
// D-0096 §2 this pins only this ticket's own content; the sections other tickets own are
// guarded by their own re-scoped tests (D-0092 §6), not by an "everything else" check here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const DOC = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

function section(start: string, end: string): string {
  const s = DOC.indexOf(start);
  const e = DOC.indexOf(end, s + start.length);
  expect(s).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(s);
  return DOC.slice(s, e);
}

const RULE_7_1 = section("### 7.1 Time model", "### 7.2 ");

describe("T-0219 rule 7.1 contract text (D-0092 §5)", () => {
  it("rule-7 (AC13) rule 7.1 defines a timed set's work as its planned duration", () => {
    expect(RULE_7_1).toContain(
      "For a timed set, work is its **planned duration**: the rule 14 pre-fill `durationS` for that exercise over the same history and `now`, which is `defaultDurationS` with no usable history (D-0092)",
    );
  });

  it("rule-7 (AC13) rule 7.1 states it is the one time model", () => {
    expect(RULE_7_1).toContain(
      "Every time cost in the engine uses this model: rule 7.2 selection, rule 7.4, rule 12 `timeCostS` and `fitsBudget`, rule 13's fit check and `applySwap`",
    );
  });

  it("R7-E13 rule-7 (AC13) the R7-E13 line cites D-0092 and the 1140 s item total", () => {
    const lines = RULE_7_1.split("\n").filter((l) => l.startsWith("- **R7-E13"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("D-0092");
    expect(lines[0]).toContain("1140");
  });

  it("rule-7 (AC13) the Traceability table has a T-0219 row", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0219\s*\|$/.test(l))).toHaveLength(1);
  });

  it("R7-E1 rule-7 (AC13) R7-E1 is unchanged", () => {
    expect(RULE_7_1.split("\n").filter((l) => l.startsWith("- **R7-E1**"))).toEqual([
      "- **R7-E1** back-squat × 4 = 720 s. leg-curl × 3 = 375 s. plank × 2 = 270 s.",
    ]);
  });
});
