// T-0215 UF-11.1 UF-11.2: the one-period rule 9 contract text (D-0061 §2, D-0094 §4; AC27) and
// the public constant (AC28). Per D-0096 §2 this pins only this ticket's own content; there is
// no "every other section unchanged" check here.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPARED_PERIODS } from "@workoutlab/engine";

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

const RULE_9 = section("## 9. Adaptive targets", "## 10. ");

function rule9Line(prefix: string): string {
  const lines = RULE_9.split("\n").filter((l) => l.startsWith(prefix));
  expect(lines, prefix).toHaveLength(1);
  return lines[0] ?? "";
}

/** D-0094 §4's Proposal sentence, verbatim. */
const PROPOSAL =
  "Look at the last ended period, if it is eligible. If it is under, propose (min − 1, max − 1). If it is over, propose (min + 1, max + 1). Clamp to 1–7, keeping min ≤ max. If the result equals the current rhythm, there is no proposal. With no eligible ended period, there is no proposal (D-0061 §2, D-0094).";

describe("T-0215 rule 9 contract text (D-0094 §4)", () => {
  it("rule-9 (AC27) the Proposal line is D-0094 §4's sentence", () => {
    expect(rule9Line("- **Proposal:**")).toBe(`- **Proposal:** ${PROPOSAL}`);
  });

  it("rule-9 (AC27) the Output line says periods holds at most one entry", () => {
    const output = rule9Line("- **Output:**");
    expect(output).toContain("`periods` holds at most one entry");
    expect(output).toContain("D-0094");
  });

  it("rule-9 (AC27) the R9-E1…E11 line is re-derived for one period and keeps its UF-11 mapping", () => {
    const line = rule9Line("- **R9-E1…E11**");
    expect(line).toContain("re-derived for one period (D-0094)");
    expect(line).toContain(
      "UF-11 spec AC1, AC2, AC3, AC4, AC5, AC7 (engine part), AC8, AC11, AC12, AC13 and AC14",
    );
  });

  it("R9-E12 rule-9 (AC27) the R9-E12 line gives the one-period result on 2026-10-11", () => {
    const line = rule9Line("- **R9-E12");
    expect(line).toContain("2026-10-11");
    expect(line).toContain("proposes 2–3");
    expect(line).toContain("D-0094");
  });

  it("R9-E13 rule-9 (AC27) the R9-E13 line keeps `plan_changed_at` 2026-09-20 exactly once and cites D-0094", () => {
    const line = rule9Line("- **R9-E13");
    expect(line.split("`plan_changed_at` 2026-09-20")).toHaveLength(2);
    expect(line).toContain("proposes 2–3");
    expect(line).toContain("D-0094");
  });

  it("rule-9 (AC27) the Traceability table has a T-0215 row", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0215\s*\|$/.test(l))).toHaveLength(1);
  });
});

describe("T-0215 public API (AC28)", () => {
  it("rule-9 (AC28) COMPARED_PERIODS is 1 (D-0094 §1)", () => {
    expect(COMPARED_PERIODS).toBe(1);
  });
});
