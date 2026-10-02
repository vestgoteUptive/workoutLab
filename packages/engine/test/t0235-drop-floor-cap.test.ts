// T-0235 UF-09.3 UF-08.2: rule 14 steps 2 (`reentry`) and 5 (`deload`) never drop to more than
// W. The one-increment floor is capped at W: min(W, max(inc, floorInc(0.9 W))) (D-0137 §1).
// Only 0 < W < inc changes. Every literal is re-derived by hand from rules 7.1, 7.4 and 14.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  floorInc,
  prefill,
  suggest,
  type HistorySet,
  type LibraryExercise,
  type PrefillResult,
  type PrefillSlot,
  type SessionInput,
  type Workout,
  type WorkoutItem,
} from "../src/index.js";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  itemsOf,
  setsWithReps,
  type SetEntry,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { lightDeload, lightReentry } from "./fixtures/t0235.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SWEEP_TIMEOUT_MS = 30_000;

/** `benchSlot`: the bench-press main slot, reps 6–8 (as the R14-E4 and R14-E5 tests). */
const benchSlot: PrefillSlot = { repsMin: 6, repsMax: 8 };

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
/** The pre-D-0137 drop (D-0057 §4), computed inline: max(inc, floorInc(0.9 × W, inc)). */
const oldDrop = (w: number, inc: number): number => round3(Math.max(inc, floorInc(0.9 * w, inc)));

function exById(id: string): LibraryExercise {
  const e = LIBRARY.find((x) => x.id === id);
  if (e === undefined) throw new Error(`no ${id} in LIBRARY`);
  return e;
}

const pf = (
  id: string,
  history: readonly HistorySet[],
  library: readonly LibraryExercise[] = LIBRARY,
): PrefillResult => {
  const e = library.find((x) => x.id === id);
  if (e === undefined) throw new Error(`no ${id}`);
  return prefill(e, benchSlot, history, library, NOW, TZ, null);
};

const S = (date: string, id: string, entries: readonly SetEntry[]): HistorySet[] =>
  setsWithReps(date, id, entries);
const x = (w: number, ...reps: number[]): SetEntry[] => reps.map((r) => [w, r] as const);
const res = (weightKg: number | null, kind: PrefillResult["kind"]): PrefillResult => ({
  weightKg,
  reps: 6,
  durationS: null,
  kind,
});

const run = (h: readonly HistorySet[], si: SessionInput): Workout =>
  suggest(h as HistorySet[], F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);

function item(w: Workout, id: string): WorkoutItem {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (found === undefined) throw new Error(`no ${id} in plan`);
  return found;
}

const hi15: SessionInput = input({
  mainLiftId: "bench-press",
  budgetMin: 15,
  warmupInBudget: false,
  energy: "high",
});

describe("T-0235 rule 14 drop capped at W (D-0137 §1)", () => {
  it("T-0235 AC1 rule-14 reentry: bench-press 2 × 6, 6, 6 on 09-01 (gap 26) → 2 × 6 reentry, never 2.5", () => {
    // Step 2: min(2, max(2.5, floorInc(1.8, 2.5) = 0)) = min(2, 2.5) = 2. Low reps 6.
    expect(pf("bench-press", lightReentry)).toEqual(res(2, "reentry"));
  });

  it("T-0235 AC2 rule-14 deload: 2 × 5, 5, 4 on 09-20 and 2 × 5, 4, 4 on 09-24 → 2 × 6 deload", () => {
    // Step 5: both sessions at W 2 with minReps 4 < 6 → min(2, max(2.5, 0)) = 2. Low reps 6.
    expect(pf("bench-press", lightDeload)).toEqual(res(2, "deload"));
  });

  it("T-0235 AC3 rule-14 suggest: AC1 history, hi15 → bench-press 2 × 6 reentry, back-off 2 × 6, 885 s", () => {
    const w = run(lightReentry, hi15);
    expect(itemsOf(w)).toEqual([["bench-press", 4]]);
    const bench = item(w, "bench-press");
    expect(bench.prefill).toEqual({ weightKg: 2, reps: 6, durationS: null, kind: "reentry" });
    // Rule 7.4 High (D-0131): min(2, max(2.5, floorInc(1.8, 2.5) = 0)) = 2; reps = main repsMin 6.
    expect(bench.backoff).toEqual({ weightKg: 2, reps: 6 });
    // Rule 7.1: 15 min, warm-up off → 900 s available. Main bench-press × 4 =
    // 4 × (45 s work + 120 s rest) + 60 s setup = 720 s. Rule 7.4: unusedS 180 ≥ one set 165 →
    // the back-off set adds 165 → itemsTotalS 885, unusedS 900 − 885 = 15.
    expect(w.itemsTotalS).toBe(885);
    expect(w.unusedS).toBe(15);
  });
});

describe("T-0235 unchanged drops (AC4)", () => {
  const benchInc = (inc: number): LibraryExercise[] =>
    LIBRARY.map((e) => (e.id === "bench-press" ? { ...e, incrementKg: inc } : e));

  it("T-0235 AC4 rule-14 R14-E4 102.5 × 8, 8, 8 on 09-01 (inc 2.5) → 90 reentry", () => {
    // floorInc(92.25, 2.5) = 90 ≤ 102.5 → unchanged.
    expect(pf("back-squat", S("2026-09-01", "back-squat", x(102.5, 8, 8, 8)))).toEqual(
      res(90, "reentry"),
    );
  });

  it("T-0235 AC4 rule-14 R14-E5 100 × 5, 5, 4 / 100 × 5, 4, 4 (inc 2.5) → 90 deload", () => {
    const h = [
      ...S("2026-09-20", "back-squat", x(100, 5, 5, 4)),
      ...S("2026-09-24", "back-squat", x(100, 5, 4, 4)),
    ];
    expect(pf("back-squat", h)).toEqual(res(90, "deload"));
  });

  it.each([
    ["bench-press", 2.5, 2.5, 2.5], // max(2.5, floorInc(2.25) = 0) = 2.5 ≤ 2.5 → 2.5
    ["bench-press", 2, 2.5, 2], // cap binds: min(2, 2.5) = 2
    ["db-bench-press", 2, 2, 2], // max(2, floorInc(1.8, 2) = 0) = 2 ≤ 2 → 2
    ["bench-press", 3, 2.5, 2.5], // max(2.5, floorInc(2.7) = 2.5) = 2.5 ≤ 3 → 2.5
    ["bench-press", 0, 2.5, 0], // D-0062 §4: W = 0 stays 0
  ] as const)(
    "T-0235 AC4 rule-14 %s %s × 6, 6, 6 on 09-01 (inc %s) → %s reentry",
    (id, w, inc, expected) => {
      const lib = id === "bench-press" ? benchInc(inc) : LIBRARY;
      expect(exById(id).incrementKg).toBe(inc);
      expect(pf(id, S("2026-09-01", id, x(w, 6, 6, 6)), lib)).toEqual(res(expected, "reentry"));
    },
  );

  it("T-0235 AC4 rule-14 push-up 0 × 8, 8, 8 on 09-01 (bodyweight, inc null) → 0 reentry", () => {
    expect(exById("push-up").incrementKg).toBeNull();
    expect(pf("push-up", S("2026-09-01", "push-up", x(0, 8, 8, 8)))).toEqual(res(0, "reentry"));
  });

  it("T-0235 AC4 rule-14 edge cases outside steps 2 and 5 are unchanged: zero history, 10 days off, timed reentry, offline-merged", () => {
    // Step 1: no history → null × 6 first_time.
    expect(pf("bench-press", [])).toEqual(res(null, "first_time"));
    // Step 3 (returning after 10 days off): 2 × 6 on 09-15 (gap 12) → W 2, hold_after_break.
    expect(pf("bench-press", S("2026-09-15", "bench-press", x(2, 6, 6, 6)))).toEqual(
      res(2, "hold_after_break"),
    );
    // Timed reentry (D-0137 §3): plank 45 s on 09-01 → max(15, floor5(40.5) = 40) = 40 s.
    const plank = exById("plank");
    expect(
      prefill(
        plank,
        { repsMin: null, repsMax: null },
        S("2026-09-01", "plank", [{ durationS: 45 }]),
        LIBRARY,
        NOW,
        TZ,
        null,
      ),
    ).toEqual({ weightKg: null, reps: null, durationS: 40, kind: "reentry" });
    // Offline-merged: the same 2 kg re-entry queued offline (pending) and replayed identically.
    const queued = lightReentry.map((r) => ({ ...r, pending: true }));
    expect(pf("bench-press", [...lightReentry, ...queued])).toEqual(res(2, "reentry"));
  });
});

describe("T-0235 only 0 < W < inc changes (AC5)", () => {
  it(
    "T-0235 AC5 rule-14 sweep: W 0.25..200 step 0.25 × inc [1, 1.25, 2, 2.5, 5]; new = old when old ≤ W, else W",
    () => {
      let unchanged = 0;
      let capped = 0;
      for (const inc of [1, 1.25, 2, 2.5, 5]) {
        const lib = LIBRARY.map((e) => (e.id === "bench-press" ? { ...e, incrementKg: inc } : e));
        for (let k = 1; k <= 800; k++) {
          const w = k / 4;
          const p = pf("bench-press", S("2026-09-01", "bench-press", x(w, 6, 6, 6)), lib);
          expect(p.kind).toBe("reentry");
          const next = p.weightKg as number;
          const old = oldDrop(w, inc);
          const key = `W ${w} inc ${inc}`;
          if (old <= w) {
            expect(next, key).toBe(old);
            unchanged++;
          } else {
            expect(next, key).toBe(w);
            expect(w, key).toBeLessThan(inc);
            capped++;
          }
          expect(next, key).toBeGreaterThan(0);
          expect(next, key).toBeLessThanOrEqual(w);
        }
      }
      expect(unchanged).toBeGreaterThan(0);
      expect(capped).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// ---- AC6: the simulated 14-day histories ----

/** The test's own rule 0 + "last performance" W: top weight of the exercise's last session. */
function lastTopWeight(history: readonly HistorySet[], exerciseId: string): number | null {
  const byClient = new Map<string, HistorySet>();
  for (const r of history) {
    const cur = byClient.get(r.clientId);
    if (cur === undefined || Date.parse(r.editedAt) >= Date.parse(cur.editedAt)) {
      byClient.set(r.clientId, r);
    }
  }
  const rows = [...byClient.values()].filter(
    (r) => r.deletedAt === null && !r.isWarmup && r.exerciseId === exerciseId,
  );
  if (rows.length === 0) return null;
  const lastMs = Math.max(...rows.map((r) => Date.parse(r.completedAt)));
  const lastSession = rows.find((r) => Date.parse(r.completedAt) === lastMs)?.sessionId;
  const ws = rows
    .filter((r) => r.sessionId === lastSession)
    .flatMap((r) => (r.weightKg === null ? [] : [r.weightKg]));
  return ws.length === 0 ? null : Math.max(...ws);
}

const AC6_HISTORIES: ReadonlyArray<readonly [string, HistorySet[]]> = [
  ...Object.entries(SIMULATED_HISTORIES),
  ["empty", []],
  ["lightReentry", lightReentry],
  ["lightDeload", lightDeload],
];

describe("T-0235 simulated 14-day histories (AC6)", () => {
  it(
    "T-0235 AC6 rule-14 sweep: budget 15..120, warm-up on/off, energy normal/high; reentry and deload never exceed W",
    () => {
      let cases = 0;
      let lightReentry2 = 0;
      let lightDeload2 = 0;
      let standardOld = 0;
      for (const [hn, h] of AC6_HISTORIES) {
        for (let b = 15; b <= 120; b += 5) {
          for (const wu of [true, false]) {
            for (const energy of ["normal", "high"] as const) {
              const si = input({
                mainLiftId: "bench-press",
                budgetMin: b,
                warmupInBudget: wu,
                energy,
              });
              const w = run(h, si);
              cases++;
              for (const i of w.plan.items) {
                const kind = i.prefill.kind;
                if (kind !== "reentry" && kind !== "deload") continue;
                const e = exById(i.exerciseId);
                if (!e.externalLoad) continue;
                const key = `${hn}|b${b}|wu${wu}|${energy}|${i.exerciseId}`;
                const W = lastTopWeight(h, i.exerciseId);
                expect(W, key).not.toBeNull();
                const p = i.prefill.weightKg as number;
                expect(p, key).toBeLessThanOrEqual(W as number);
                if ((W as number) > 0) expect(p, key).toBeGreaterThan(0);
                const old = (W as number) > 0 ? oldDrop(W as number, e.incrementKg ?? 2.5) : 0;
                expect(p, key).toBe(old <= (W as number) ? old : W);
                if (hn === "lightReentry" && kind === "reentry" && p === 2) lightReentry2++;
                if (hn === "lightDeload" && kind === "deload" && p === 2) lightDeload2++;
                if (!hn.startsWith("light") && p === old) standardOld++;
              }
            }
          }
        }
      }
      // 7 histories × 22 budgets × 2 warm-up × 2 energy.
      expect(cases).toBe(616);
      expect(lightReentry2).toBeGreaterThan(0);
      expect(lightDeload2).toBeGreaterThan(0);
      // The standard histories reach step 5 (isolations logged at 8 reps under a 10–15 slot in
      // two sessions at one W), always at the unchanged old formula.
      expect(standardOld).toBeGreaterThan(0);
    },
    SWEEP_TIMEOUT_MS,
  );
});

// ---- AC7: the contract text (D-0137 §4) ----

const DOC = readFileSync(
  path.resolve(TEST_DIR, "..", "..", "..", "docs", "engine-rules.md"),
  "utf8",
);

describe("T-0235 contract text (D-0137 §4, AC7)", () => {
  const start = DOC.indexOf("\n## 14.");
  const end = DOC.indexOf("\n## Required tests", start);
  const rule14 = DOC.slice(start + 1, end).split("\n");
  const one = (prefix: string): string => {
    const found = rule14.filter((l) => l.startsWith(prefix));
    expect(found, prefix).toHaveLength(1);
    return found[0] as string;
  };

  it("T-0235 AC7 rule-14 steps 2 and 5 state min(W, max(inc, floorInc(0.9 W)))", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(one("2. ")).toContain("min(W, max(inc, floorInc(0.9 W)))");
    expect(one("5. ")).toContain("min(W, max(inc, floorInc(0.9 W)))");
  });

  it("T-0235 AC7 rule-14 the Drop floor bullet states the cap, D-0137 and the worked case, keeping T-0221's tokens", () => {
    const bullet = one("- **Drop floor (");
    for (const t of ["capped at", "D-0137", "2 × 6", "reentry"]) expect(bullet, t).toContain(t);
    for (const t of ["incrementKg ?? 2.5", "one increment", "0 + inc"]) {
      expect(bullet, t).toContain(t);
    }
  });

  it("T-0235 AC7 rule-14 has exactly nine R14-E lines", () => {
    expect(rule14.filter((l) => l.startsWith("- **R14-E"))).toHaveLength(9);
  });

  it("T-0235 AC7 rule-14 the Traceability table has exactly one T-0235 row", () => {
    const table = DOC.slice(DOC.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0235\s*\|$/.test(l))).toHaveLength(1);
  });
});

// ---- AC9: purity ----

describe("T-0235 purity (AC9)", () => {
  it("T-0235 AC9 rule-0 AC1–AC3 calls are deterministic and don't mutate deep-frozen inputs", () => {
    const lib = deepFreeze(structuredClone(LIBRARY));
    const bench = lib.find((e) => e.id === "bench-press") as LibraryExercise;
    const slot = deepFreeze({ ...benchSlot });
    for (const h0 of [lightReentry, lightDeload]) {
      const h = deepFreeze(structuredClone(h0));
      const a = prefill(bench, slot, h, lib, NOW, TZ, null);
      const b = prefill(bench, slot, h, lib, NOW, TZ, null);
      expect(b).toStrictEqual(a);
      expect(h).toStrictEqual(h0);
    }
    const h = deepFreeze(structuredClone(lightReentry));
    const si = deepFreeze({ ...hi15 });
    const targets = deepFreeze(structuredClone(F_TARGETS));
    const prof = deepFreeze(structuredClone(F_PROFILE));
    const a = suggest(h, targets, prof, lib, si, NOW, TZ);
    const b = suggest(h, targets, prof, lib, si, NOW, TZ);
    expect(b).toStrictEqual(a);
    expect(a).toStrictEqual(run(lightReentry, hi15));
  });
});
