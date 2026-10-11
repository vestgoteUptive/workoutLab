// T-0635 UF-02.1: rule 15 records on the simulated 14-day histories (R15-E12, engine DoD), and
// AC11: records is display-only (suggest output is unchanged; no planner module imports records.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { records, suggest, type HistorySet } from "@workoutlab/engine";
import { F_INPUT, F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze } from "./fixtures/common.js";
import { SIMULATED_HISTORIES, balancedHistory } from "./fixtures/histories.js";

const BENCH = [60, 62.5, 62.5, 60, 65, 65, 67.5];
const SQUAT_REPS = [5, 5, 6, 6, 8, 7, 8];
const DEAD_BUG_REPS = [10, 12, 12, 15, 15, 15, 15];
const DATES = ["09-15", "09-17", "09-19", "09-21", "09-23", "09-25", "09-27"].map(
  (d) => `2026-${d}`,
);

/** R15-E12: the balanced history with progressive loads; every other exercise stays 50 × 8. */
const progressive: HistorySet[] = balancedHistory.map((s) => {
  const k = DATES.indexOf(s.completedAt.slice(0, 10));
  if (s.exerciseId === "bench-press") return { ...s, weightKg: BENCH[k] ?? null };
  if (s.exerciseId === "back-squat") return { ...s, weightKg: 100, reps: SQUAT_REPS[k] ?? null };
  if (s.exerciseId === "dead-bug") return { ...s, weightKg: 0, reps: DEAD_BUG_REPS[k] ?? null };
  return s;
});

const rec = (ex: string, date: string, w: number, r: number, pw: number, pr: number) => ({
  exerciseId: ex,
  sessionId: `s@${date}T10:00:00+02:00`,
  clientId: `${ex}@${date}T10:00:00+02:00#0`,
  completedAt: `${date}T10:00:00+02:00`,
  weightKg: w,
  reps: r,
  durationS: null,
  previous: { weightKg: pw, reps: pr, durationS: null },
});

describe("rule-15 records on the simulated 14-day histories", () => {
  it.each(Object.keys(SIMULATED_HISTORIES) as Array<keyof typeof SIMULATED_HISTORIES>)(
    "rule-15 R15-E12 (AC9) %s (every set 50 × 8) has no records",
    (name) => {
      expect(records(deepFreeze(SIMULATED_HISTORIES[name]), LIBRARY)).toEqual([]);
    },
  );

  it("rule-15 R15-E12 (AC9) balanced with progressive loads gives the fixed list of 7 records", () => {
    expect(records(deepFreeze(progressive), LIBRARY)).toEqual([
      rec("bench-press", "2026-09-17", 62.5, 8, 60, 8),
      rec("dead-bug", "2026-09-17", 0, 12, 0, 10),
      rec("back-squat", "2026-09-19", 100, 6, 100, 5),
      rec("dead-bug", "2026-09-21", 0, 15, 0, 12),
      rec("back-squat", "2026-09-23", 100, 8, 100, 6),
      rec("bench-press", "2026-09-23", 65, 8, 62.5, 8),
      rec("bench-press", "2026-09-27", 67.5, 8, 65, 8),
    ]);
  });
});

describe("rule-15 records is display-only (AC11)", () => {
  it.each([...Object.entries(SIMULATED_HISTORIES), ["balanced-progressive", progressive] as const])(
    "rule-15 (AC11) suggest on %s is identical with and without a records() call",
    (_n, h) => {
      const history = deepFreeze(h);
      const without = suggest(history, F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);
      records(history, LIBRARY);
      const withIt = suggest(history, F_TARGETS, F_PROFILE, LIBRARY, F_INPUT, NOW, TZ);
      expect(withIt).toEqual(without);
    },
  );

  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
  /** Every src file reachable from `entry` through relative imports (type-only imports too). */
  function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const f = stack.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      const file = ts.createSourceFile(
        f,
        readFileSync(path.join(SRC, f), "utf8"),
        ts.ScriptTarget.Latest,
      );
      for (const st of file.statements) {
        const spec =
          (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
          st.moduleSpecifier !== undefined &&
          ts.isStringLiteral(st.moduleSpecifier)
            ? st.moduleSpecifier.text
            : null;
        if (spec?.startsWith("./")) stack.push(spec.slice(2).replace(/\.js$/, ".ts"));
      }
    }
    return seen;
  }

  it.each([
    "session.ts",
    "balance.ts",
    "timecheck.ts",
    "swaps.ts",
    "prefill.ts",
    "apply-swap.ts",
    "remove-item.ts",
  ])("rule-15 (AC11) %s does not reach records.ts in the import graph", (entry) => {
    const graph = reachable(entry);
    expect(graph.size).toBeGreaterThan(1);
    expect(graph.has("records.ts")).toBe(false);
  });

  it("rule-15 (AC11) non-vacuity: index.ts does reach records.ts", () => {
    expect(reachable("index.ts").has("records.ts")).toBe(true);
  });
});
