// T-0533 UF-05.1 UF-08.3 (D-0199 §3, D-0200 §3): rule 0.1, rankSwaps' 9th parameter
// `excludeIds = []`, filtered at pool level. AC1–AC3 (R12-E17…E19), AC4 the D-0199 guard
// allowance, AC5/AC6 are the unchanged rule 12/13 suites, AC8 traceability.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  rankSwaps,
  suggest,
  type HistorySet,
  type SwapCandidate,
  type SwapReason,
  type Workout,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, fSwap, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { R12_E1_LINE } from "./fixtures/r12-e1-d0056.js";
import { RULE12_SIGNATURE_LINE } from "./fixtures/rule12-signature-d0130.js";
import { RULE12_SIGNATURE_LINE_D0199 } from "./fixtures/rule12-signature-d0199.js";
import { rule12Slice, t0204GuardOk, t0224GuardOk } from "./rule12-guards.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

const REASONS: Array<SwapReason | null> = [
  null,
  "equipment_taken",
  "discomfort",
  "variety",
  "short_on_time",
];

function rank(
  current: string,
  reason: SwapReason | null,
  excludeIds?: readonly string[],
  opts: { session?: Workout; history?: readonly HistorySet[] } = {},
): SwapCandidate[] {
  const args = [
    current,
    reason,
    opts.session ?? fSwap(),
    F_PROFILE,
    LIBRARY,
    opts.history ?? [],
    NOW,
    TZ,
  ] as const;
  return excludeIds === undefined ? rankSwaps(...args) : rankSwaps(...args, excludeIds);
}

const ids = (list: readonly SwapCandidate[]): string[] => list.map((c) => c.exerciseId);

describe("rule 0.1 rankSwaps excludeIds (D-0199 §3)", () => {
  it("R12-E17 rule-12 (T-0533 AC1) excludeIds [db-row]: inverted-row (bestMatch), lat-pulldown, seated-cable-row, straight-arm-pulldown", () => {
    const list = rank("barbell-row", null, ["db-row"]);
    expect(ids(list)).toEqual([
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
    expect(list.map((c) => c.bestMatch)).toEqual([true, false, false, false]);
    expect(list.map((c) => c.muscleMatch)).toEqual([1, 1, 1, 0.667]);
  });

  it("R12-E17 rule-12 (T-0533 AC1) excludeIds [] is deep-equal to the 8-argument call, for every reason and slot", () => {
    for (const item of fSwap().plan.items) {
      for (const reason of REASONS) {
        const eight = rank(item.exerciseId, reason);
        expect(eight.length, `${item.exerciseId} ${String(reason)}`).toBeGreaterThan(0);
        expect(rank(item.exerciseId, reason, []), `${item.exerciseId} ${String(reason)}`).toEqual(
          eight,
        );
      }
    }
  });

  it("R12-E17 rule-12 (T-0533 AC1) excludeIds [barbell-row] (the current exercise) does not throw and equals R12-E1", () => {
    expect(() => rank("barbell-row", null, ["barbell-row"])).not.toThrow();
    const list = rank("barbell-row", null, ["barbell-row"]);
    expect(list).toEqual(rank("barbell-row", null));
    expect(ids(list)).toEqual([
      "db-row",
      "inverted-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
  });

  it("R12-E18 rule-12 (T-0533 AC2) R12-E5 with excludeIds [push-up]: [db-bench-press], the keep-all fallback on the filtered pool", () => {
    // Without the exclusion R12-E5 is [push-up]; db-bench-press shares the bench.
    expect(ids(rank("bench-press", "equipment_taken"))).toEqual(["push-up"]);
    const list = rank("bench-press", "equipment_taken", ["push-up"]);
    expect(ids(list)).toEqual(["db-bench-press"]);
    expect(list[0]?.bestMatch).toBe(true);
  });

  it("R12-E19 rule-12 (T-0533 AC3) R12-E5 with excludeIds [push-up, db-bench-press]: [], never a fallback to an excluded exercise", () => {
    expect(rank("bench-press", "equipment_taken", ["push-up", "db-bench-press"])).toEqual([]);
    for (const reason of REASONS) {
      expect(rank("bench-press", reason, ["db-bench-press", "push-up"]), String(reason)).toEqual(
        [],
      );
    }
  });

  it("R12-E17 rule-12 (T-0533 edge) duplicates, order and unknown ids in excludeIds have no effect", () => {
    const base = rank("barbell-row", null, ["db-row"]);
    expect(rank("barbell-row", null, ["db-row", "db-row"])).toEqual(base);
    expect(rank("barbell-row", null, ["no-such-exercise", "db-row", "zzz"])).toEqual(base);
    expect(rank("barbell-row", null, ["no-such-exercise"])).toEqual(rank("barbell-row", null));
    expect(
      rank("bench-press", "equipment_taken", ["db-bench-press", "push-up", "push-up"]),
    ).toEqual([]);
  });

  it("R12-E17 rule-12 (T-0533) excludeIds is not mutated", () => {
    const ex = Object.freeze(["db-row"]);
    expect(() => rank("barbell-row", null, ex)).not.toThrow();
    expect(ex).toEqual(["db-row"]);
  });
});

describe("rule 0.1 over the simulated 14-day histories (D-0199 §3)", () => {
  const budgets = [15, 30, 90];
  for (const [name, history] of Object.entries(SIMULATED_HISTORIES)) {
    it(`R12-E17 rule-12 (T-0533) ${name}: no excluded id is offered, [] equals the 8-argument call, at budgets 15/30/90 min`, () => {
      const sessions = [
        fSwap(),
        ...budgets.map((budgetMin) =>
          suggest(history, F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin }), NOW, TZ),
        ),
      ];
      let checked = 0;
      for (const session of sessions) {
        for (const item of session.plan.items) {
          for (const reason of REASONS) {
            const label = `${name} ${session.budgetMin} ${item.exerciseId} ${String(reason)}`;
            const all = rank(item.exerciseId, reason, undefined, { session, history });
            expect(rank(item.exerciseId, reason, [], { session, history }), label).toEqual(all);
            if (all.length === 0) continue;
            // Exclude the top candidate: it disappears, the rest keep their relative order.
            const top = all[0]?.exerciseId ?? "";
            const without = rank(item.exerciseId, reason, [top], { session, history });
            expect(ids(without), label).not.toContain(top);
            if (reason !== "equipment_taken") {
              expect(ids(without), label).toEqual(ids(all).filter((id) => id !== top));
            }
            // Excluding every candidate (reason none lists them before any sort-key filter)
            // leaves nothing, even for equipment_taken's keep-all fallback.
            const every = ids(rank(item.exerciseId, null, undefined, { session, history }));
            expect(rank(item.exerciseId, reason, every, { session, history }), label).toEqual([]);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});

// AC4: the D-0199 line is the one more accepted change inside the guarded slice.
const SIG = RULE12_SIGNATURE_LINE_D0199;
/** Today's doc (D-0199 line); its D-0130 and pre-D-0130 versions. */
const D0199_DOC = doc;
const D0130_DOC = D0199_DOC.replace(SIG.after, SIG.before);
const PRE_DOC = D0130_DOC.replace(RULE12_SIGNATURE_LINE.after, RULE12_SIGNATURE_LINE.before);
const oldE1 = (d: string): string => d.replace(R12_E1_LINE.after, R12_E1_LINE.before);
/** One more character inside the slice, in R12-E2. */
const touchE2 = (d: string): string =>
  d.replace("- **R12-E2 (short_on_time)**", "- **R12-E2 (short_on_time)** ");
/** R12-E17 moved before the R12-E5 line, i.e. into the slice. */
function e17BeforeE5(d: string): string {
  const lines = d.split("\n");
  const e17 = lines.findIndex((l) => l.startsWith("- **R12-E17"));
  const [line] = lines.splice(e17, 1);
  const e5 = lines.findIndex((l) => l.startsWith("- **R12-E5"));
  lines.splice(e5, 0, line ?? "");
  return lines.join("\n");
}

const GUARDS = [
  ["T-0204", t0204GuardOk],
  ["T-0224", t0224GuardOk],
] as const;

describe("T-0533 AC4 the rule 12 guards accept the D-0199 signature line (amends D-0130 §2)", () => {
  it("T-0533 AC4 rule-12 the doc has the D-0199 line, R12-E17…E19 sit right after R12-E5 and outside the slice", () => {
    expect(D0199_DOC.split("\n").filter((l) => l === SIG.after)).toHaveLength(1);
    expect(D0130_DOC).not.toBe(D0199_DOC);
    expect(PRE_DOC).not.toBe(D0130_DOC);
    const lines = D0199_DOC.split("\n");
    const e5 = lines.findIndex((l) => l.startsWith("- **R12-E5"));
    expect(lines.slice(e5 + 1, e5 + 4).map((l) => l.slice(0, 12))).toEqual([
      "- **R12-E17 ",
      "- **R12-E18 ",
      "- **R12-E19 ",
    ]);
    const slice = rule12Slice(D0199_DOC);
    for (const id of ["R12-E17", "R12-E18", "R12-E19"]) expect(slice).not.toContain(id);
    expect(e17BeforeE5(D0199_DOC)).not.toBe(D0199_DOC);
    expect(rule12Slice(e17BeforeE5(D0199_DOC))).toContain("R12-E17");
  });

  for (const [name, ok] of GUARDS) {
    it(`T-0533 AC4 rule-12 rule-13 ${name} guard: main at the D-0130 line, at the pre-D-0130 line or at the D-0199 line passes`, () => {
      expect(ok(D0199_DOC, D0130_DOC)).toBe(true);
      expect(ok(D0199_DOC, PRE_DOC)).toBe(true);
      expect(ok(D0199_DOC, D0199_DOC)).toBe(true);
    });

    it(`T-0533 AC4 rule-12 rule-13 ${name} guard: one more character in R12-E2, or R12-E17 before R12-E5, fails`, () => {
      for (const main of [D0199_DOC, D0130_DOC, PRE_DOC]) {
        expect(ok(touchE2(D0199_DOC), main)).toBe(false);
        expect(ok(e17BeforeE5(D0199_DOC), main)).toBe(false);
      }
      // The D-0199 edit applied backwards on a branch is not accepted against a fixed main.
      expect(ok(D0130_DOC, D0199_DOC)).toBe(false);
      expect(ok(PRE_DOC, D0199_DOC)).toBe(false);
    });
  }

  it("T-0533 AC4 rule-12 T-0204 guard: the D-0199 line combines with the D-0056 §1 and D-0130 reverts", () => {
    expect(t0204GuardOk(D0199_DOC, oldE1(D0199_DOC))).toBe(true);
    expect(t0204GuardOk(D0199_DOC, oldE1(D0130_DOC))).toBe(true);
    expect(t0204GuardOk(D0199_DOC, oldE1(PRE_DOC))).toBe(true);
    expect(t0204GuardOk(touchE2(D0199_DOC), oldE1(PRE_DOC))).toBe(false);
  });

  it("T-0533 AC4 rule-12 T-0224 guard: still no R12-E1 allowance", () => {
    expect(t0224GuardOk(D0199_DOC, oldE1(D0130_DOC))).toBe(false);
    expect(t0224GuardOk(D0199_DOC, oldE1(PRE_DOC))).toBe(false);
  });
});

describe("T-0533 AC8 traceability", () => {
  it("T-0533 AC8 rule-12 the Traceability table has one rule-0.1 T-0533 row citing R12-E17…E19 and D-0199 §3", () => {
    const table = doc.slice(doc.indexOf("## Traceability"));
    const rows = table.split("\n").filter((l) => /^\|.*\|\s*T-0533\s*\|$/.test(l));
    expect(rows).toEqual(["| 0.1 rankSwaps excludeIds (R12-E17…E19, D-0199 §3) | T-0533 |"]);
  });

  it("T-0533 AC8 rule-12 rule 0.1 exists, rule 0 lists the new parameter, and R12-E17…E19 are each named in a test title", () => {
    const r0 = doc.slice(doc.indexOf("## 0. "), doc.indexOf("## 1. "));
    expect(r0).toContain("\n### 0.1 ");
    expect(r0).toContain("`rankSwaps(…, excludeIds = [])`");
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const self = path.basename(fileURLToPath(import.meta.url));
    const titles: string[] = [];
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
      // Titles here count, but not the ids inside this test's own body.
      const text = readFileSync(path.join(TEST_DIR, f), "utf8");
      const body = f === self ? text.slice(0, text.indexOf('describe("T-0533 AC8')) : text;
      for (const m of body.matchAll(titleRe)) titles.push(m[2] ?? "");
    }
    const missing = ["R12-E17", "R12-E18", "R12-E19"].filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });
});
