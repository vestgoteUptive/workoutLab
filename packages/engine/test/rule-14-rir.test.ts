// T-0952 rule 14 UF-09.3 UF-09.4: RIR holds the weight once (step 4 / 4b `hold_effort`), the own
// step through the effective library, and nothing else reading `rir` (D-0250, D-0252, D-0259).
// AC1-AC9 (AC10 properties are rule-14-rir-properties.test.ts, AC11 rule-14-rir-histories.test.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applySwap,
  balance,
  prefill,
  records,
  suggest,
  timeCheck,
  type HistorySet,
  type LibraryExercise,
  type PrefillResult,
  type PrefillSlot,
} from "../src/index.js";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, deepFreeze, input } from "./fixtures/common.js";
import { rirSession, top, withSteps, type RirEntry } from "./fixtures/rir.js";

const MAIN: PrefillSlot = { repsMin: 6, repsMax: 8 };
const ISOLATION: PrefillSlot = { repsMin: 10, repsMax: 15 };

function ex(id: string, library: readonly LibraryExercise[] = LIBRARY): LibraryExercise {
  const found = library.find((e) => e.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}
function pf(
  id: string,
  slot: PrefillSlot,
  history: readonly HistorySet[],
  opts: { now?: string; library?: readonly LibraryExercise[] } = {},
): PrefillResult {
  const lib = opts.library ?? LIBRARY;
  return prefill(ex(id, lib), slot, history, lib, opts.now ?? NOW, TZ, null);
}
const r = (
  weightKg: number | null,
  reps: number | null,
  kind: PrefillResult["kind"],
): PrefillResult => ({ weightKg, reps, durationS: null, kind });
const bench = (date: string, entries: readonly RirEntry[]): HistorySet[] =>
  rirSession(date, "bench-press", entries);

describe("rule 14 step 4 / 4b: RIR gates the weight increase", () => {
  it("R14-E10 rule-14 (AC1) 80 × 8, 8, 8 at RIR 2, 2, 1 → 80 × 8 hold_effort", () => {
    expect(pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [2, 2, 1])))).toEqual(
      r(80, 8, "hold_effort"),
    );
  });

  it("R14-E12 rule-14 (AC1) RIR null, null, 0 → a null set is ignored, a 0 counts: hold_effort", () => {
    expect(pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [null, null, 0])))).toEqual(
      r(80, 8, "hold_effort"),
    );
  });

  it("R14-E11 rule-14 (AC2) RIR 3, 2, 2 → 82.5 × 6 increase (not gated)", () => {
    expect(pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [3, 2, 2])))).toEqual(
      r(82.5, 6, "increase"),
    );
  });

  it("R14-E13 rule-14 (AC2) every rir null or absent → 82.5 × 6 increase, identical to R14-E1", () => {
    const nulls = pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [null, null, null])));
    expect(nulls).toEqual(r(82.5, 6, "increase"));
    const noKey = bench("2026-09-24", [
      [80, 8],
      [80, 8],
      [80, 8],
    ]);
    expect(noKey.every((s) => !("rir" in s))).toBe(true);
    expect(pf("bench-press", MAIN, noKey)).toEqual(r(82.5, 6, "increase"));
  });
});

describe("rule 14 heldOnce (D-0259 §1)", () => {
  const e14a = bench("2026-09-20", top(80, 8, [1, 1, 0]));
  const e14b = bench("2026-09-24", top(80, 8, [1, 1, 1]));

  it("R14-E14 rule-14 (AC3) one hold, then up: 82.5 × 6 increase; the 09-24 session alone holds", () => {
    expect(pf("bench-press", MAIN, [...e14a, ...e14b])).toEqual(r(82.5, 6, "increase"));
    expect(pf("bench-press", MAIN, e14b)).toEqual(r(80, 8, "hold_effort"));
  });

  it("R14-E15 rule-14 (AC4) the earlier session at another W: hold_effort", () => {
    const earlier = bench("2026-09-20", top(77.5, 8, [1, 1, 1]));
    expect(pf("bench-press", MAIN, [...earlier, ...e14b])).toEqual(r(80, 8, "hold_effort"));
  });

  it("R14-E24 rule-14 (AC4) the earlier session at RIR 3, 3, 3 was not a hold: hold_effort", () => {
    const earlier = bench("2026-09-20", top(80, 8, [3, 3, 3]));
    expect(pf("bench-press", MAIN, [...earlier, ...e14b])).toEqual(r(80, 8, "hold_effort"));
  });

  it("rule-14 (AC4) the earlier session without any RIR was not a hold: hold_effort", () => {
    const earlier = bench("2026-09-20", top(80, 8, [null, null, null]));
    expect(pf("bench-press", MAIN, [...earlier, ...e14b])).toEqual(r(80, 8, "hold_effort"));
  });

  it("rule-14 (AC4) the earlier session below the top reps is not a hold: hold_effort", () => {
    const earlier = bench("2026-09-20", [
      [80, 8, 0],
      [80, 8, 0],
      [80, 7, 0],
    ]);
    expect(pf("bench-press", MAIN, [...earlier, ...e14b])).toEqual(r(80, 8, "hold_effort"));
  });

  it("R14-E25 rule-14 (AC4) the earlier hold 12 days before the last session: hold_effort; 9 days before: increase", () => {
    const at = (date: string): HistorySet[] => bench(date, top(80, 8, [0, 0, 0]));
    const last = bench("2026-09-24", top(80, 8, [1, 1, 1]));
    const opts = { now: "2026-09-25T12:00:00+02:00" };
    expect(pf("bench-press", MAIN, [...at("2026-09-12"), ...last], opts)).toEqual(
      r(80, 8, "hold_effort"),
    );
    // Boundary: 10 days is still stale (< 10 needed), 9 days is a hold that counts.
    expect(pf("bench-press", MAIN, [...at("2026-09-14"), ...last], opts)).toEqual(
      r(80, 8, "hold_effort"),
    );
    expect(pf("bench-press", MAIN, [...at("2026-09-15"), ...last], opts)).toEqual(
      r(82.5, 6, "increase"),
    );
  });

  // The 10-day gap counts local days in the user's zone, not UTC dates (D-0259 §1).
  describe("rule-14 (AC4) the gap is in local days, not UTC dates", () => {
    // Distinct session ids (from the label date); the instants alone decide the local days.
    const at = (instant: string, rirs: readonly unknown[]): HistorySet[] =>
      bench(`label-${instant}`, top(80, 8, rirs)).map((s) => ({
        ...s,
        completedAt: instant,
        editedAt: instant,
      }));
    const run = (tz: string, prior: string, last: string): PrefillResult =>
      prefill(
        ex("bench-press"),
        MAIN,
        [...at(prior, [0, 0, 0]), ...at(last, [1, 1, 1])],
        LIBRARY,
        "2026-09-25T12:00:00Z",
        tz,
        null,
      );

    it("Pacific/Auckland: local gap 9, UTC-date gap 10 → increase", () => {
      expect(run("Pacific/Auckland", "2026-09-14T23:00:00Z", "2026-09-24T10:00:00Z")).toEqual(
        r(82.5, 6, "increase"),
      );
    });

    it("Pacific/Auckland: local gap 10, UTC-date gap 9 → hold_effort", () => {
      expect(run("Pacific/Auckland", "2026-09-15T11:00:00Z", "2026-09-24T13:00:00Z")).toEqual(
        r(80, 8, "hold_effort"),
      );
    });

    it("America/Los_Angeles: local gap 10, UTC-date gap 9 → hold_effort", () => {
      expect(run("America/Los_Angeles", "2026-09-15T01:00:00Z", "2026-09-24T08:00:00Z")).toEqual(
        r(80, 8, "hold_effort"),
      );
    });

    it("America/Los_Angeles: local gap 9, UTC-date gap 10 → increase", () => {
      expect(run("America/Los_Angeles", "2026-09-14T23:00:00Z", "2026-09-24T05:00:00Z")).toEqual(
        r(82.5, 6, "increase"),
      );
    });
  });
});

describe("rule 14 ladder: RIR is read only by steps 4 and 4b", () => {
  it("R14-E16 rule-14 (AC5) 80 × 8, 8, 8 at RIR 0, gap 12 → 80 × 6 hold_after_break; gap 21+ → reentry (floorInc(72) = 70)", () => {
    const h = bench("2026-09-15", top(80, 8, [0, 0, 0]));
    expect(pf("bench-press", MAIN, h)).toEqual(r(80, 6, "hold_after_break"));
    const old = bench("2026-09-06", top(80, 8, [0, 0, 0]));
    expect(pf("bench-press", MAIN, old)).toEqual(r(70, 6, "reentry"));
  });

  it("R14-E17 rule-14 (AC6) 80 × 8, 7, 6 at RIR 0 → 80 × 7 add_rep", () => {
    const h = bench("2026-09-24", [
      [80, 8, 0],
      [80, 7, 0],
      [80, 6, 0],
    ]);
    expect(pf("bench-press", MAIN, h)).toEqual(r(80, 7, "add_rep"));
  });

  it("R14-E18 rule-14 (AC6) a back-off 72.5 × 8 at RIR 0 beside three sets at 80 with RIR 2 → 82.5 × 6 increase", () => {
    const h = bench("2026-09-24", [...top(80, 8, [2, 2, 2]), [72.5, 8, 0]]);
    expect(pf("bench-press", MAIN, h)).toEqual(r(82.5, 6, "increase"));
    // A back-off set with RIR 0 and a heavier-set RIR of 2: same. A RIR 0 at W still holds.
    const h2 = bench("2026-09-24", [...top(80, 8, [2, 2, 0]), [72.5, 8, 3]]);
    expect(pf("bench-press", MAIN, h2)).toEqual(r(80, 8, "hold_effort"));
  });

  it("R14-E19 rule-14 (AC6) push-up 0 × 15, 15, 15 at RIR 0 → 0 × 15 increase (bodyweight never reads rir)", () => {
    const h = rirSession("2026-09-24", "push-up", top(0, 15, [0, 0, 0]));
    expect(pf("push-up", { repsMin: 8, repsMax: 15 }, h)).toEqual(r(0, 15, "increase"));
  });

  it("R14-E20 rule-14 (AC6) plank 45, 45, 40 s is unchanged (timed never reaches 4b)", () => {
    const rows = rirSession("2026-09-24", "plank", [
      [null, null],
      [null, null],
      [null, null],
    ]).map((s, i) => ({ ...s, durationS: [45, 45, 40][i] as number, rir: 0 }));
    expect(
      prefill(ex("plank"), { repsMin: null, repsMax: null }, rows, LIBRARY, NOW, TZ, null),
    ).toEqual({ weightKg: null, reps: null, durationS: 45, kind: "add_rep" });
  });

  it("rule-14 (AC6) deload and hold ignore rir (step 5 / 6 compare reps only)", () => {
    const a = rirSession("2026-09-20", "back-squat", [
      [100, 5, 0],
      [100, 5, 0],
      [100, 4, 0],
    ]);
    const b = rirSession("2026-09-24", "back-squat", [
      [100, 5, 0],
      [100, 4, 0],
      [100, 4, 0],
    ]);
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(90, 6, "deload"));
    expect(pf("back-squat", MAIN, b)).toEqual(r(100, 6, "hold"));
  });
});

describe("rule 14 own step through the effective library (D-0252 §2)", () => {
  const eff = withSteps({ "lateral-raise": 1.25, "back-squat": 1.25, "bench-press": 1.25 });
  // db-curl: an isolation lift, library step 2.5, user step 1.25.
  const curl = (step: number): LibraryExercise => ({
    ...ex("biceps-curl"),
    id: "db-curl",
    incrementKg: step,
  });

  it("R14-E21 rule-14 (AC7) db-curl 20 × 15, 15, 15 at RIR 3, 2, 2: 21.25 × 10 increase (22.5 without the override)", () => {
    const h = rirSession("2026-09-24", "db-curl", top(20, 15, [3, 2, 2]));
    const run = (step: number): PrefillResult =>
      prefill(curl(step), ISOLATION, h, [curl(step)], NOW, TZ, null);
    expect(run(1.25)).toEqual(r(21.25, 10, "increase"));
    expect(run(2.5)).toEqual(r(22.5, 10, "increase"));
  });

  it("R14-E22 rule-14 (AC7) back-squat 102 × 5, 5, 4 then 102 × 5, 4, 4 at step 1.25: floorInc(91.8) = 91.25 × 6 deload", () => {
    const a = rirSession("2026-09-20", "back-squat", [
      [102, 5],
      [102, 5],
      [102, 4],
    ]);
    const b = rirSession("2026-09-24", "back-squat", [
      [102, 5],
      [102, 4],
      [102, 4],
    ]);
    expect(pf("back-squat", MAIN, [...a, ...b], { library: eff })).toEqual(r(91.25, 6, "deload"));
    expect(pf("back-squat", MAIN, [...a, ...b])).toEqual(r(90, 6, "deload"));
  });

  const high = input({
    energy: "high",
    budgetMin: 15,
    warmupInBudget: false,
    mainLiftId: "bench-press",
  });
  const h80 = bench("2026-09-24", top(80, 5, [], 3));

  it("R14-E23 rule-14 (AC7) High energy, bench-press pre-fill 80 × 6, step 1.25: back-off 71.25 × 6 (70 × 6 at 2.5)", () => {
    const run = (lib: readonly LibraryExercise[]) =>
      suggest(h80, F_TARGETS, F_PROFILE, lib, high, NOW, TZ).plan.items.find(
        (i) => i.exerciseId === "bench-press",
      );
    expect(run(eff)?.prefill).toEqual(r(80, 6, "hold"));
    expect(run(eff)?.backoff).toEqual({ weightKg: 71.25, reps: 6 });
    expect(run(LIBRARY)?.backoff).toEqual({ weightKg: 70, reps: 6 });
  });

  it("rule-14 (AC7) suggest, applySwap and prefill all use the same 1.25 step", () => {
    const lib = withSteps({ "bench-press": 1.25, "db-bench-press": 1.25 });
    const w = suggest(h80, F_TARGETS, F_PROFILE, lib, high, NOW, TZ);
    const swapped = applySwap(
      w,
      "bench-press",
      "db-bench-press",
      null,
      h80,
      F_PROFILE,
      lib,
      NOW,
      TZ,
    );
    const swappedItem = swapped.plan.items.find((i) => i.exerciseId === "db-bench-press");
    // db-bench-press carries 80, back-off floorInc(72, 1.25) = 71.25.
    expect(swappedItem?.prefill).toEqual(r(80, 6, "carry"));
    expect(swappedItem?.backoff).toEqual({ weightKg: 71.25, reps: 6 });
    // prefill: bench-press 80 × 8, 8, 8 steps up by 1.25 in the same library.
    expect(
      pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [3, 3, 3])), { library: lib }),
    ).toEqual(r(81.25, 6, "increase"));
  });
});

describe("rule 14 RIR: nothing else reads rir (D-0259 §3)", () => {
  const many: HistorySet[] = [
    ...bench("2026-09-20", top(80, 8, [1, 1, 0])),
    ...bench("2026-09-24", top(80, 8, [0, 1, 2])),
    ...rirSession("2026-09-25", "back-squat", top(100, 5, [0, 1, 2])),
    ...rirSession("2026-09-26", "lat-pulldown", top(50, 10, [3, 3, 3])),
  ];
  const stripped: HistorySet[] = many.map(({ rir: _rir, ...rest }) => rest);

  it("rule-15 (AC8) records, balance and timeCheck output equals the output with rir removed", () => {
    expect(many.some((s) => s.rir !== undefined)).toBe(true);
    expect(records(many, LIBRARY)).toEqual(records(stripped, LIBRARY));
    expect(balance(many, F_TARGETS, LIBRARY, NOW, TZ)).toEqual(
      balance(stripped, F_TARGETS, LIBRARY, NOW, TZ),
    );
    const w = suggest(stripped, F_TARGETS, F_PROFILE, LIBRARY, input(), NOW, TZ);
    const progress = { elapsedS: 0, nextItemIndex: 0 };
    // timeCheck takes only the workout and progress; the workout built with rir (deep-frozen
    // input too) gives the same check as the one built without.
    const wRir = suggest(deepFreeze(many), F_TARGETS, F_PROFILE, LIBRARY, input(), NOW, TZ);
    expect(timeCheck(wRir, progress)).toEqual(timeCheck(w, progress));
  });
});

describe("rule 14 RIR: invalid rir is null (AC9)", () => {
  const invalid: unknown[] = [1.5, 6, -1, Number.NaN, "2", Infinity, true, {}, 2.0000001];
  it.each(invalid.map((v) => [String(v), v] as const))(
    "rule-14 (AC9) rir %s behaves as null and does not throw",
    (_label, value) => {
      const withBad = bench("2026-09-24", top(80, 8, [value, value, value]));
      expect(pf("bench-press", MAIN, withBad)).toEqual(r(82.5, 6, "increase"));
      // Mixed with a valid 0 the valid one counts; the invalid ones are ignored.
      const mixed = bench("2026-09-24", top(80, 8, [value, 0, value]));
      expect(pf("bench-press", MAIN, mixed)).toEqual(r(80, 8, "hold_effort"));
      // An invalid rir in the earlier session is not a hold.
      const earlier = bench("2026-09-20", top(80, 8, [value, value, value]));
      expect(
        pf("bench-press", MAIN, [...earlier, ...bench("2026-09-24", top(80, 8, [1, 1, 1]))]),
      ).toEqual(r(80, 8, "hold_effort"));
    },
  );

  it("rule-14 (AC9) the valid bounds 0 and 5 are read: 5, 5, 5 increases, 0 holds", () => {
    expect(pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [5, 5, 5])))).toEqual(
      r(82.5, 6, "increase"),
    );
    expect(pf("bench-press", MAIN, bench("2026-09-24", top(80, 8, [0, 5, 5])))).toEqual(
      r(80, 8, "hold_effort"),
    );
  });
});

describe("docs/engine-rules.md carries the T-0952 text (AC: contract)", () => {
  const doc = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "docs",
      "engine-rules.md",
    ),
    "utf8",
  );
  const expectations: Record<string, string[]> = {
    "R14-E10": ["80 × 8 (`hold_effort`)"],
    "R14-E11": ["82.5 × 6 (`increase`)"],
    "R14-E12": ["80 × 8 (`hold_effort`)"],
    "R14-E13": ["82.5 × 6 (`increase`)", "R14-E1"],
    "R14-E14": ["82.5 × 6 (`increase`)", "80 × 8 (`hold_effort`)"],
    "R14-E15": ["80 × 8 (`hold_effort`)"],
    "R14-E16": ["`hold_after_break`", "`reentry`"],
    "R14-E17": ["80 × 7 (`add_rep`)"],
    "R14-E18": ["82.5 × 6 (`increase`)"],
    "R14-E19": ["0 × 15 (`increase`)"],
    "R14-E20": ["R14-E8"],
    "R14-E21": ["21.25 × 10 (`increase`)"],
    "R14-E22": ["91.25 × 6 (`deload`)"],
    "R14-E23": ["71.25 × 6"],
    "R14-E24": ["80 × 8 (`hold_effort`)"],
    "R14-E25": ["80 × 8 (`hold_effort`)", "82.5 × 6 (`increase`)"],
  };
  it.each(Object.entries(expectations))(
    "rule-14 %s line exists once with its values",
    (id, tokens) => {
      const lines = doc
        .split("\n")
        .filter((l) => l.startsWith(`- **${id}`) && new RegExp(`^- \\*\\*${id}(?!\\d)`).test(l));
      expect(lines).toHaveLength(1);
      for (const t of tokens) expect(lines[0], t).toContain(t);
    },
  );

  it("rule-10 lists the hold_effort kind and rule 14 has steps 4 and 4b", () => {
    expect(doc).toContain("add_rep|hold_effort}");
    expect(doc).toMatch(
      /^4b\. Loaded, every set at W has reps ≥ high, otherwise: `W`, high reps \(`hold_effort`\)/m,
    );
    expect(doc).toMatch(/^\| .*T-0952 \|$/m);
  });
});
