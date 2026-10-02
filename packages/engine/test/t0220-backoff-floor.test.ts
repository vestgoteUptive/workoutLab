// T-0220 UF-08.2 UF-09.3 UF-05.1: the High-energy back-off is never 0 kg on a light loaded main
// lift; it gets one increment, capped at the main weight (D-0131, rule 7.4, rule 12.1). AC1–AC9.
// Every literal is re-derived by hand from rules 7.1, 7.4, 12.1 and 14 next to the assertion.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applySwap,
  floorInc,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type PrefillResult,
  type SessionInput,
  type Workout,
  type WorkoutItem,
} from "../src/index.js";
import { backoffOf } from "../src/session.js";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, itemsOf } from "./fixtures/common.js";
import { SWEEP_HISTORIES, hi15, light, sweepInputs } from "./fixtures/t0220.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SWEEP_TIMEOUT_MS = 30_000;

const run = (h: readonly HistorySet[], si: SessionInput): Workout =>
  suggest(h as HistorySet[], F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

function exById(id: string): LibraryExercise {
  const e = LIBRARY.find((x) => x.id === id);
  if (e === undefined) throw new Error(`no ${id}`);
  return e;
}

/** The pre-D-0131 rule 7.4 formula, computed inline. */
const oldBackoff = (w: number, inc: number): number => floorInc(0.9 * w, inc);

describe("T-0220 rule 7.4 light-lift back-off in suggest (D-0131 §1)", () => {
  it("T-0220 AC1 R7-E16 rule-7 bench-press 2.5 × 6 ×3, hi15: × 4 at 2.5 × 7 add_rep + back-off 2.5 × 6, 885 s", () => {
    const w = run(light(2.5), hi15);
    // Rule 7.2: one main lift; 15 min warm-up off = 900 s; bench × 4 = 4 × (45 + 120) + 60 = 720 s.
    expect(itemsOf(w)).toEqual([["bench-press", 4]]);
    const bench = item(w, "bench-press");
    // Rule 14: every set at 6 ≥ repsMin 6 but < repsMax 10 → add_rep 2.5 × 7.
    expect(bench.prefill).toEqual({ weightKg: 2.5, reps: 7, durationS: null, kind: "add_rep" });
    // Rule 7.4 High: unusedS 180 ≥ 165 → back-off. floorInc(2.25, 2.5) = 0 → max(2.5, 0) = 2.5,
    // min(2.5, 2.5) = 2.5 (D-0131 §1). Reps = the goal's main repsMin 6.
    expect(bench.backoff).toEqual({ weightKg: 2.5, reps: 6 });
    expect(bench.reasons).toContainEqual({ code: "energy_high_backoff" });
    // 720 + 165 = 885; 900 − 885 = 15.
    expect(w.itemsTotalS).toBe(885);
    expect(w.unusedS).toBe(15);
  });

  it("T-0220 AC2 rule-7 bench-press logged at 2 kg: back-off 2 × 6, never above the main weight", () => {
    const w = run(light(2), hi15);
    const bench = item(w, "bench-press");
    expect(bench.prefill).toEqual({ weightKg: 2, reps: 7, durationS: null, kind: "add_rep" });
    // floorInc(1.8, 2.5) = 0 → max(2.5, 0) = 2.5 → min(2, 2.5) = 2.
    expect(bench.backoff).toEqual({ weightKg: 2, reps: 6 });
    expect(bench.backoff?.weightKg).not.toBe(2.5);
  });
});

describe("T-0220 rule 12.1 applySwap recompute (D-0131 §2)", () => {
  it("T-0220 AC3 rule-12 bench-press 2 kg → db-bench-press carries 2 × 6, back-off 2 × 6, 885 s", () => {
    const h = light(2);
    const w = run(h, hi15);
    const s = applySwap(w, "bench-press", "db-bench-press", null, h, F_PROFILE, LIBRARY, NOW, TZ);
    const db = item(s, "db-bench-press");
    expect(db.isMain).toBe(true);
    expect(db.sets).toBe(4);
    // Rule 14 step 1: previous bench-press 2 kg, shares chest 1.0 + bench → carry 2 × repsMin 6.
    expect(db.prefill).toEqual({ weightKg: 2, reps: 6, durationS: null, kind: "carry" });
    // inc 2: floorInc(1.8, 2) = 0 → max(2, 0) = 2 → min(2, 2) = 2.
    expect(db.backoff).toEqual({ weightKg: 2, reps: 6 });
    // 4 × 165 + 60 = 720, plus one set 165 = 885.
    expect(db.costS).toBe(885);
  });
});

describe("T-0220 backoffOf helper (D-0131 §1)", () => {
  const bench = exById("bench-press");
  const pf = (weightKg: number | null): PrefillResult => ({
    weightKg,
    reps: 6,
    durationS: null,
    kind: "carry",
  });
  const withInc = (inc: number | null): LibraryExercise => ({ ...bench, incrementKg: inc });

  it.each([
    [null, 2.5, null],
    [0, 2.5, 0],
    [0, null, 0],
    [2.5, 2.5, 2.5],
    [2, 2.5, 2],
    [2, 2, 2],
    [2.75, 2.5, 2.5],
    [2.8, 2.5, 2.5],
    [5, 5, 5],
    [80, 2.5, 70],
    [80, 2, 72],
    [100, 2.5, 90],
  ] as const)("T-0220 AC4 rule-7 main weight %s at inc %s → back-off %s", (w, inc, expected) => {
    expect(backoffOf(withInc(inc), pf(w), 6)).toEqual({ weightKg: expected, reps: 6 });
  });

  it("T-0220 AC5 rule-7 only the old-0 case changes: new = old when old > 0, else min(w, inc)", () => {
    let unchanged = 0;
    let raised = 0;
    for (const inc of [1, 1.25, 2, 2.5, 5]) {
      for (let k = 2; k <= 800; k++) {
        const w = k / 4; // 0.5 … 200 step 0.25
        const next = backoffOf(withInc(inc), pf(w), 6).weightKg as number;
        const old = oldBackoff(w, inc);
        if (old > 0) {
          expect(next, `w ${w} inc ${inc}`).toBe(old);
          unchanged++;
        } else {
          expect(next, `w ${w} inc ${inc}`).toBe(Math.min(w, inc));
          raised++;
        }
        expect(next).toBeGreaterThan(0);
        expect(next).toBeLessThanOrEqual(w);
      }
    }
    expect(unchanged).toBeGreaterThan(0);
    expect(raised).toBeGreaterThan(0);
  });
});

// ---- AC6 ----

// The whole-plan deep-equal against a frozen pre-T-0220 snapshot was a one-time proof that
// D-0131 changed only the back-off weight. It is recorded in
// docs/tickets/T-0220-backoff-floor-light-lift.md (build and accept log) and was retired by
// T-0236. The sweep keeps the invariants that need no old code: the old rule 7.4 formula is
// computed inline with oldBackoff.
describe("T-0220 simulated 14-day histories (AC6)", () => {
  it(
    "T-0220 AC6 rule-7 sweep: High energy, budget 15..120, warm-up on/off; only light back-offs change",
    () => {
      let lightRaised = 0;
      let standardUnchanged = 0;
      let cases = 0;
      for (const [hn, h] of SWEEP_HISTORIES) {
        for (const [k, si] of sweepInputs()) {
          const key = `${hn}|${k}`;
          const w = run(h, si);
          cases++;
          for (const i of w.plan.items) {
            if (i.backoff === null) continue;
            const pw = i.prefill.weightKg;
            const bw = i.backoff.weightKg;
            if (pw === null) expect(bw, key).toBeNull();
            else if (pw === 0) expect(bw, key).toBe(0);
            else {
              expect(bw, key).toBeGreaterThan(0);
              expect(bw as number, key).toBeLessThanOrEqual(pw);
              const inc = exById(i.exerciseId).incrementKg ?? 2.5;
              const old = oldBackoff(pw, inc);
              if (old > 0) expect(bw, key).toBe(old);
              if (bw !== old) expect(hn, key).toBe("light");
              if (hn !== "light" && bw === old) standardUnchanged++;
            }
            if (hn === "light" && bw === 2.5) lightRaised++;
          }
        }
      }
      // 6 histories (4 simulated, empty, light) × 44 inputs (budget 15..120 step 5 × warm-up on/off).
      expect(cases).toBe(264);
      expect(lightRaised).toBeGreaterThan(0);
      expect(standardUnchanged).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// ---- AC7 ----

const DOC = readFileSync(
  path.resolve(TEST_DIR, "..", "..", "..", "docs", "engine-rules.md"),
  "utf8",
);
const LINES = DOC.split("\n");

describe("T-0220 contract text (D-0131 §3, AC7)", () => {
  it("T-0220 AC7 rule-7 the §7.4 High sentence states the D-0131 formula", () => {
    const s = DOC.slice(DOC.indexOf("### 7.4"), DOC.indexOf("## 8."));
    const high = s.split("\n").find((l) => l.includes("**High:**"));
    expect(high).toContain("min(");
    expect(high).toContain("max(inc, floorInc(0.9 × main weight))");
    expect(high).toContain("D-0131");
  });

  it("T-0220 AC7 rule-7 an R7-E16 line sits after R7-E12 and before ## 8., with 2.5 × 6 and D-0131", () => {
    const e12 = LINES.findIndex((l) => l.startsWith("- **R7-E12"));
    const r8 = LINES.findIndex((l) => l.startsWith("## 8."));
    const e16 = LINES.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith("- **R7-E16"));
    expect(e16).toHaveLength(1);
    const [line, i] = e16[0] as readonly [string, number];
    expect(i).toBeGreaterThan(e12);
    expect(i).toBeLessThan(r8);
    expect(line).toContain("2.5 × 6");
    expect(line).toContain("D-0131");
  });

  it("T-0220 AC7 rule-12 the §12.1 Item bullet cites D-0131 for the back-off", () => {
    const s = DOC.slice(DOC.indexOf("### 12.1 applySwap"), DOC.indexOf("## 13."));
    const bullet = s.split("\n").find((l) => l.startsWith("- **Item:**"));
    expect(bullet).toMatch(/back-off[^.]*D-0131/);
  });

  it("T-0220 AC7 rule-7 the Traceability table has exactly one T-0220 row", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0220\s*\|$/.test(l))).toHaveLength(1);
  });
});

// ---- AC9 ----

describe("T-0220 purity (AC9)", () => {
  it("T-0220 AC9 rule-0 AC1–AC3 calls are deterministic and don't mutate deep-frozen inputs", () => {
    for (const wKg of [2.5, 2]) {
      const h = deepFreeze(light(wKg));
      const si = deepFreeze({ ...hi15 });
      const a = suggest(
        h,
        deepFreeze(F_TARGETS),
        deepFreeze(F_PROFILE),
        deepFreeze(LIBRARY),
        si,
        NOW,
        TZ,
      );
      const b = suggest(h, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
      expect(b).toStrictEqual(a);
      const wf = deepFreeze(a);
      const s1 = applySwap(
        wf,
        "bench-press",
        "db-bench-press",
        null,
        h,
        F_PROFILE,
        LIBRARY,
        NOW,
        TZ,
      );
      const s2 = applySwap(
        wf,
        "bench-press",
        "db-bench-press",
        null,
        h,
        F_PROFILE,
        LIBRARY,
        NOW,
        TZ,
      );
      expect(s2).toStrictEqual(s1);
    }
  });
});
