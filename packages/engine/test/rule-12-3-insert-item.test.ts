// T-0945 UF-09.10: rule 12.3 `insertItem`, one exercise added to a workout in progress
// (D-0244 §1, D-0246 §8–§10). AC8–AC19 (R12-E20…R12-E26) and the AC28 contract text.
// Every literal is re-derived from rules 7.1, 7.2, 7.4, 10 and 14 in the comment next to it.
// The simulated histories are rule-12-3-insert-histories.test.ts, the seeded properties
// rule-12-3-insert-properties.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import {
  insertItem,
  suggest,
  timeCheck,
  timeLeftS,
  type InsertResult,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  setsWithReps,
} from "./fixtures/common.js";
import { B1_STATE, fixtureP, insert, notInPlan } from "./fixtures/insert-p.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = path.resolve(TEST_DIR, "..");
const REPO_DIR = path.resolve(ENGINE_DIR, "..", "..");

const P = fixtureP();

function ok(r: InsertResult): { workout: Workout; sets: number } {
  if (r.workout === undefined) throw new Error(`expected an insert, got ${JSON.stringify(r)}`);
  return { workout: r.workout, sets: r.sets };
}

/** "Unchanged" (AC8): the other items keep order and value, and the listed fields deep-equal. */
function expectUnchanged(r: Workout, w: Workout, k: number): void {
  expect(r.plan.items).toHaveLength(w.plan.items.length + 1);
  expect(r.plan.items.filter((_, i) => i !== k)).toStrictEqual(w.plan.items);
  expect(r.plan.version).toBe(w.plan.version);
  expect(r.plan.mainLiftId).toBe(w.plan.mainLiftId);
  expect(r.plan.warmup).toStrictEqual(w.plan.warmup);
  expect(r.plan.startDeficits).toStrictEqual(w.plan.startDeficits);
  expect(r.sessionReasons).toStrictEqual(w.sessionReasons);
  expect(r.budgetMin).toBe(w.budgetMin);
  expect(r.warmupInBudget).toBe(w.warmupInBudget);
  expect(r.energy).toBe(w.energy);
}

// A valid 8-item plan: R7-E8's 90-min suggestion at zero history (8 items, 975 s unused).
const P8 = suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin: 90 }), NOW, TZ);

describe("rule 12.3 insertItem examples (R12-E20…R12-E26)", () => {
  it("R12-E20 rule-12.3 (AC8, B1) lateral-raise × 3 after bench-press: 375 s, 1920, 2100, 600", () => {
    expect(timeLeftS(P, B1_STATE)).toBe(945);
    const { workout: r, sets } = ok(insert(P, "lateral-raise", 1, 945));
    expect(sets).toBe(3);
    expect(r.plan.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "lateral-raise",
      "inverted-row",
      "leg-extension",
    ]);
    // Isolation: 3 × (45 + 60) + 60 = 375; build_muscle isolation slot 10–15; first time null × 10.
    const added = r.plan.items[1] as WorkoutItem;
    expect(added).toStrictEqual({
      exerciseId: "lateral-raise",
      isMain: false,
      sets: 3,
      repsMin: 10,
      repsMax: 15,
      durationS: null,
      costS: 375,
      backoff: null,
      prefill: { weightKg: null, reps: 10, durationS: null, kind: "first_time" },
      reasons: [
        { code: "area_deficit", area: "shoulders", deficit: 1 },
        { code: "days_since", area: "shoulders", days: null },
        { code: "prefill", kind: "first_time" },
      ],
    });
    expect("swap" in added).toBe(false);
    expect(added.reasons.some((x) => x.code === "swap")).toBe(false);
    // 1545 + 375 = 1920; + 180 = 2100; 2520 − 1920 = 600.
    expect([r.itemsTotalS, r.totalS, r.unusedS]).toEqual([1920, 2100, 600]);
    expect(r.plan.mainLiftId).toBe("bench-press");
    expectUnchanged(r, P, 1);
  });

  it("R12-E20 rule-8 (B17) the next time check counts the added item: 375 + 555 + 270, behindS −200", () => {
    const { workout: r } = ok(insert(P, "lateral-raise", 1, 945));
    const t = timeCheck(r, { elapsedS: 1300, nextItemIndex: 1 });
    expect(t.projectedS - 1300).toBe(1200);
    expect([t.behindS, t.show]).toEqual([-200, false]);
  });

  it("R12-E21 rule-12.3 (AC9, B2) leftS 345: 3 sets (375) don't fit, lateral-raise × 2 (270) does", () => {
    const P35 = fixtureP({ budgetMin: 35 });
    expect(timeLeftS(P35, B1_STATE)).toBe(345);
    const { workout: r, sets } = ok(insert(P35, "lateral-raise", 1, 345));
    expect(sets).toBe(2);
    const added = r.plan.items[1] as WorkoutItem;
    // 2 × 105 + 60 = 270; no energy_low_trim at normal energy.
    expect([added.sets, added.costS]).toEqual([2, 270]);
    expect(added.reasons.map((x) => x.code)).toEqual(["area_deficit", "days_since", "prefill"]);
    expect(r.itemsTotalS).toBe(1815);
  });

  it.each([
    [32, 165],
    [30, 45],
  ])(
    "R12-E22 rule-12.3 (AC10, B3/B4) budgetMin %i, leftS %i: {refused: time}, no workout",
    (b, left) => {
      expect(timeLeftS(fixtureP({ budgetMin: b }), B1_STATE)).toBe(left);
      const r = insert(fixtureP({ budgetMin: b }), "lateral-raise", 1, left);
      expect(r).toStrictEqual({ refused: "time" });
      expect(r.workout).toBeUndefined();
    },
  );

  it("R12-E22 rule-12.3 (D-0247 §3) a negative leftS refuses for time too", () => {
    expect(insert(P, "lateral-raise", 1, -300)).toStrictEqual({ refused: "time" });
    // The boundary is inclusive: costS ≤ leftS fits.
    expect(ok(insert(P, "lateral-raise", 1, 375)).sets).toBe(3);
    expect(ok(insert(P, "lateral-raise", 1, 374)).sets).toBe(2);
    expect(ok(insert(P, "lateral-raise", 1, 270)).sets).toBe(2);
    expect(insert(P, "lateral-raise", 1, 269)).toStrictEqual({ refused: "time" });
  });

  it("R12-E23 rule-12.3 (AC11, B5) back-squat × 3, 8–12, not main, 555 s, at index 1", () => {
    const { workout: r } = ok(insert(P, "back-squat", 1, 945));
    const added = r.plan.items[1] as WorkoutItem;
    // Compound: 3 × (45 + 120) + 60 = 555; build_muscle other-compound slot 8–12.
    expect([added.exerciseId, added.sets, added.repsMin, added.repsMax]).toEqual([
      "back-squat",
      3,
      8,
      12,
    ]);
    expect([added.isMain, added.costS, added.backoff]).toEqual([false, 555, null]);
    expect(added.reasons.some((x) => x.code === "main_lift")).toBe(false);
    // First primary area in the fixed order is glutes (before quads).
    expect(added.reasons[0]).toStrictEqual({ code: "area_deficit", area: "glutes", deficit: 1 });
    expect(r.plan.mainLiftId).toBe("bench-press");
    expectUnchanged(r, P, 1);
  });

  it("R12-E24 rule-12.3 (AC12, B6) energy low: lateral-raise × 2 with energy_low_trim in rule 10 order", () => {
    const low = fixtureP({ energy: "low" });
    const { workout: r, sets } = ok(insert(low, "lateral-raise", 1, 945));
    expect(sets).toBe(2);
    const added = r.plan.items[1] as WorkoutItem;
    expect([added.sets, added.costS]).toEqual([2, 270]);
    expect(added.reasons.map((x) => x.code)).toEqual([
      "area_deficit",
      "days_since",
      "energy_low_trim",
      "prefill",
    ]);
    expect(r.energy).toBe("low");
  });

  it("R12-E24 rule-12.3 (AC12) sibling, energy normal: same order without energy_low_trim", () => {
    const added = ok(insert(P, "lateral-raise", 1, 945)).workout.plan.items[1] as WorkoutItem;
    expect(added.reasons.map((x) => x.code)).toEqual(["area_deficit", "days_since", "prefill"]);
  });

  it("R12-E24 rule-12.3 (AC12) energy low never tries 3 sets and refuses below 270", () => {
    const low = fixtureP({ energy: "low" });
    expect(ok(insert(low, "back-squat", 1, 5000)).sets).toBe(2);
    expect(insert(low, "lateral-raise", 1, 269)).toStrictEqual({ refused: "time" });
  });

  it("R12-E25 rule-12.3 (AC13, B8) after bench-press and inverted-row, biceps-curl is appended × 3", () => {
    const state = { elapsedS: 1500, setsDone: [4, 3, 1], skippedItems: [], warmupLeftS: 0 };
    expect(timeLeftS(P, state)).toBe(1095);
    const { workout: r, sets } = ok(insert(P, "biceps-curl", 3, 1095));
    expect(sets).toBe(3);
    expect(r.plan.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "inverted-row",
      "leg-extension",
      "biceps-curl",
    ]);
    expect((r.plan.items[3] as WorkoutItem).costS).toBe(375);
    expectUnchanged(r, P, 3);
  });

  it("R12-E26 rule-12.3 (AC14, B13) lateral-raise 10 × 12, 12, 12 on 09-17: 10 × 10 hold_after_break, days_since 10", () => {
    const history = setsWithReps("2026-09-17", "lateral-raise", [
      [10, 12],
      [10, 12],
      [10, 12],
    ]);
    const { workout: r } = ok(insert(P, "lateral-raise", 1, 945, history));
    const added = r.plan.items[1] as WorkoutItem;
    // Rule 14 step 3: gap 10 ≥ 10, so W = 10 at the low reps (10).
    expect(added.prefill).toStrictEqual({
      weightKg: 10,
      reps: 10,
      durationS: null,
      kind: "hold_after_break",
    });
    expect(added.reasons).toStrictEqual([
      { code: "area_deficit", area: "shoulders", deficit: 1 },
      { code: "days_since", area: "shoulders", days: 10 },
      { code: "prefill", kind: "hold_after_break" },
    ]);
  });

  it("rule-12.3 a timed exercise gets its planned duration and cost; no carry from the neighbour", () => {
    // plank first time: 45 s, isolation rest 60 → 3 × 105 + 60 = 375, reps null.
    const added = ok(insert(P, "plank", 1, 945)).workout.plan.items[1] as WorkoutItem;
    expect([added.durationS, added.costS, added.repsMin, added.repsMax]).toEqual([
      45,
      375,
      null,
      null,
    ]);
    // db-bench-press after bench-press at 80 kg would carry in a swap; an insert has no previous.
    const heavy: Workout = {
      ...P,
      plan: {
        ...P.plan,
        items: P.plan.items.map((i, k) =>
          k === 0 ? { ...i, prefill: { ...i.prefill, weightKg: 80, kind: "increase" } } : i,
        ),
      },
    };
    const db = ok(insert(heavy, "db-bench-press", 1, 945)).workout.plan.items[1] as WorkoutItem;
    expect(db.prefill.kind).toBe("first_time");
    expect(db.prefill.weightKg).toBeNull();
  });

  it("rule-12.3 the profile goal picks the accessory slot (get_stronger compound 5–8)", () => {
    const strong = { ...F_PROFILE, goal: "get_stronger" as const };
    const res = insertItem(
      P,
      "back-squat",
      { atIndex: 1, leftS: 945 },
      [],
      strong,
      LIBRARY,
      NOW,
      TZ,
    );
    const r = ok(res).workout.plan.items[1] as WorkoutItem;
    expect([r.repsMin, r.repsMax, r.isMain]).toEqual([5, 8, false]);
  });

  it("rule-12.3 days_since counts sets logged today, as in applySwap", () => {
    const today = setsWithReps("2026-09-27", "overhead-press", [[30, 8]], { time: "11:00" });
    const added = ok(insert(P, "lateral-raise", 1, 945, today)).workout.plan
      .items[1] as WorkoutItem;
    expect(added.reasons[1]).toStrictEqual({ code: "days_since", area: "shoulders", days: 0 });
  });
});

describe("rule 12.3 check order, cap and duplicates (AC15–AC17, D-0246 §8)", () => {
  const structural: Array<[string, string, number, number, string]> = [
    ["unknown id", "no-such-exercise", 1, 0, NOW],
    ["warm-up move", "wu-arm-circle", 1, 0, NOW],
    ["id already an item", "inverted-row", 1, 0, NOW],
    ["id already a skipped item (still a plan item)", "leg-extension", 1, 0, NOW],
    ["atIndex −1", "lateral-raise", -1, 0, NOW],
    ["atIndex 1.5", "lateral-raise", 1.5, 0, NOW],
    ["leftS 1.5", "lateral-raise", 1, 1.5, NOW],
    ["now without offset", "lateral-raise", 1, 0, "2026-09-27T12:00:00"],
  ];

  it.each(structural)(
    "rule-12.3 (AC15) %s on P with leftS 0 is a RangeError",
    (_n, id, at, left, now) => {
      expect(() => insert(P, id, at, left, [], now)).toThrow(RangeError);
    },
  );

  it("rule-12.3 (AC15) atIndex items.length + 1 is a RangeError; items.length appends", () => {
    expect(() => insert(P, "lateral-raise", 4, 945)).toThrow(RangeError);
    expect(ok(insert(P, "lateral-raise", 3, 945)).workout.plan.items[3]?.exerciseId).toBe(
      "lateral-raise",
    );
    expect(ok(insert(P, "lateral-raise", 0, 945)).workout.plan.items[0]?.exerciseId).toBe(
      "lateral-raise",
    );
  });

  it("rule-12.3 (AC15) structural beats the cap: every fault on an 8-item plan with leftS 0 throws", () => {
    expect(P8.plan.items).toHaveLength(8);
    const inPlan = P8.plan.items[2]!.exerciseId;
    const faults: Array<[string, number, number, string]> = [
      ["no-such-exercise", 1, 0, NOW],
      ["wu-arm-circle", 1, 0, NOW],
      [inPlan, 1, 0, NOW],
      ["lateral-raise", -1, 0, NOW],
      ["lateral-raise", 9, 0, NOW],
      ["lateral-raise", 1.5, 0, NOW],
      ["lateral-raise", 1, 1.5, NOW],
      ["lateral-raise", 1, 0, "2026-09-27T12:00:00"],
    ];
    for (const [id, at, left, now] of faults) {
      expect(() => insert(P8, id, at, left, [], now), `${id} ${at} ${left} ${now}`).toThrow(
        RangeError,
      );
    }
  });

  it("rule-12.3 (AC15) an unknown goal is structural too (RangeError before the cap)", () => {
    const bad = { ...F_PROFILE, goal: "bulk" as unknown as "build_muscle" };
    expect(() =>
      insertItem(P8, "lateral-raise", { atIndex: 1, leftS: 0 }, [], bad, LIBRARY, NOW, TZ),
    ).toThrow(RangeError);
  });

  it("rule-12.3 (AC15) the cap beats time: an 8-item plan, a valid new id and leftS 0 → items_cap", () => {
    expect(insert(P8, "lateral-raise", 1, 0)).toStrictEqual({ refused: "items_cap" });
  });

  it("rule-12.3 (AC16) a valid 8-item plan never becomes 9: every insert is items_cap", () => {
    const candidates = notInPlan(P8);
    expect(candidates.length).toBeGreaterThan(0);
    for (const e of candidates) {
      for (const at of [0, 4, 8]) {
        for (const left of [-60, 0, 100_000]) {
          expect(insert(P8, e.id, at, left), `${e.id} ${at} ${left}`).toStrictEqual({
            refused: "items_cap",
          });
        }
      }
    }
  });

  it("rule-12.3 (AC17) every id already in the plan is a RangeError at any index and leftS", () => {
    for (const w of [P, P8]) {
      for (const item of w.plan.items) {
        for (const at of [0, w.plan.items.length]) {
          expect(() => insert(w, item.exerciseId, at, 100_000)).toThrow(RangeError);
        }
      }
    }
  });

  it("rule-12.3 (AC17) no result holds a duplicate id", () => {
    for (const e of notInPlan(P)) {
      for (const at of [0, 1, 2, 3]) {
        const r = insert(P, e.id, at, 100_000);
        const ids = ok(r).workout.plan.items.map((i) => i.exerciseId);
        expect(new Set(ids).size, `${e.id} at ${at}`).toBe(ids.length);
      }
    }
  });
});

describe("rule 12.3 purity and determinism (AC18)", () => {
  it("rule-12.3 (AC18) frozen inputs: two calls deep-equal and nothing is mutated", () => {
    const w = deepFreeze(structuredClone(P));
    const history = deepFreeze(
      setsWithReps("2026-09-17", "lateral-raise", [
        [10, 12],
        [10, 12],
      ]),
    );
    const lib = deepFreeze(structuredClone(LIBRARY));
    const profile = deepFreeze(structuredClone(F_PROFILE));
    const opts = deepFreeze({ atIndex: 1, leftS: 945 });
    const before = structuredClone([w, history, lib, profile, opts]);
    const a = insertItem(w, "lateral-raise", opts, history, profile, lib, NOW, TZ);
    const b = insertItem(w, "lateral-raise", opts, history, profile, lib, NOW, TZ);
    expect(a).toStrictEqual(b);
    expect([w, history, lib, profile, opts]).toStrictEqual(before);
    // The result never aliases the input.
    const r = ok(a).workout;
    expect(r.plan.items[0]).not.toBe(w.plan.items[0]);
    expect(r.plan.warmup).not.toBe(w.plan.warmup);
    expect(r.sessionReasons).not.toBe(w.sessionReasons);
  });

  it("rule-0 (AC18) the §0 purity list names insertItem( and timeLeftS(", () => {
    const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    const r0 = doc.slice(doc.indexOf("## 0. "), doc.indexOf("## 1. "));
    const list = r0.split("\n").find((l) => l.startsWith("- All engine functions are pure"));
    expect(list).toContain(
      "insertItem(workout, exerciseId, {atIndex, leftS}, history, profile, library, now, tz)",
    );
    expect(list).toContain("timeLeftS(workout, {elapsedS, setsDone, skippedItems, warmupLeftS})");
  });

  it("rule-0 (AC18) insert-item.ts and timecheck.ts pass the engine purity lint", async () => {
    const eslint = new ESLint({
      cwd: ENGINE_DIR,
      overrideConfigFile: path.join(ENGINE_DIR, "eslint.config.mjs"),
    });
    const results = await eslint.lintFiles([
      path.join(ENGINE_DIR, "src", "insert-item.ts"),
      path.join(ENGINE_DIR, "src", "timecheck.ts"),
    ]);
    expect(results).toHaveLength(2);
    expect(results.flatMap((r) => r.messages.map((m) => m.message))).toEqual([]);
  }, 30_000);
});

describe("rule 12.3 invariants after an insert (AC19, D-0246 §10)", () => {
  it("rule-12.3 (AC19) a skipped item's kept cost can push itemsTotalS over available: unusedS is 0", () => {
    // R7-E4 at 30 min (available 1620), leg-extension skipped, warm-up not started:
    // 1800 − 0 − 180 − 720 − 555 = 345 → lateral-raise × 2 (270) fits the time left,
    // but 1545 + 270 = 1815 > 1620 (R7-E8 is not asserted after an insert).
    const P30 = fixtureP({ budgetMin: 30 });
    const left = timeLeftS(P30, {
      elapsedS: 0,
      setsDone: [0, 0, 0],
      skippedItems: [2],
      warmupLeftS: 180,
    });
    expect(left).toBe(345);
    const { workout: r, sets } = ok(insert(P30, "lateral-raise", 3, left));
    expect(sets).toBe(2);
    expect(r.itemsTotalS).toBe(1815);
    expect(r.itemsTotalS).toBeGreaterThan(1620);
    expect([r.unusedS, r.totalS]).toEqual([0, 1995]);
  });
});

describe("rule 12.3 and rule 8 contract text (AC28)", () => {
  const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
  const lines = doc.split("\n");
  const r123 = doc.slice(doc.indexOf("### 12.3 insertItem"), doc.indexOf("## 13."));
  const r8 = doc.slice(doc.indexOf("## 8. "), doc.indexOf("## 9. "));

  it("rule-12.3 (AC28) a ### 12.3 heading sits after ### 12.2 and before ## 13.", () => {
    const h = lines.findIndex((l) => l.startsWith("### 12.3 insertItem"));
    expect(h).toBeGreaterThan(lines.findIndex((l) => l.startsWith("### 12.2 removeItem")));
    expect(h).toBeLessThan(lines.findIndex((l) => l.startsWith("## 13.")));
  });

  it("rule-12.3 (AC28) rule 12.3 states item, sets, low energy, reasons, check order, invariants, sessionReasons", () => {
    for (const label of [
      "- **Item:**",
      "- **Sets:**",
      "- **Reasons**",
      "- **Workout:**",
      "- **Check order",
      "- **Invariants",
    ]) {
      expect(
        r123.split("\n").filter((l) => l.startsWith(label)),
        label,
      ).toHaveLength(1);
    }
    expect(r123).toContain("3, then 2");
    expect(r123).toContain("At Low energy only 2 is tried");
    expect(r123).toContain("`area_deficit`, `days_since`, `energy_low_trim`");
    expect(r123).toContain("`sessionReasons` unchanged");
    expect(r123).toContain('`{refused: "items_cap"}`');
    expect(r123).toContain('`{refused: "time"}`');
    expect(r123).toContain("D-0246 §8");
  });

  it.each(["R12-E20", "R12-E21", "R12-E22", "R12-E23", "R12-E24", "R12-E25", "R12-E26"])(
    "rule-12.3 (AC28) the %s line exists once in §12.3",
    (id) => {
      expect(r123.split("\n").filter((l) => l.startsWith(`- **${id} `))).toHaveLength(1);
    },
  );

  it("rule-8 (AC28) rule 8 has the timeLeftS paragraph: formula, consistency condition and model limits", () => {
    const para = r8.split("\n").find((l) => l.startsWith("**Time left (`timeLeftS`"));
    expect(para).toBeDefined();
    expect(para).toContain("budgetMin × 60 − elapsedS − warmupLeftS − Σ remaining(i)");
    expect(para).toContain("only when no item at or after the next one has sets logged ahead");
    expect(para).toContain("overstates the time left by up to 120 s");
    expect(para).toContain("understates it");
    expect(para).toContain("rule 7.1 cost model");
    for (const id of ["R8-E4", "R8-E5", "R8-E6", "R8-E7"]) {
      expect(
        r8.split("\n").filter((l) => l.startsWith(`- **${id} `)),
        id,
      ).toHaveLength(1);
    }
  });

  it("rule-12.3 (AC28) the Traceability table has one T-0945 row naming 12.3 and 8", () => {
    const table = doc.slice(doc.indexOf("## Traceability"));
    const rows = table.split("\n").filter((l) => /^\|.*\|\s*T-0945\s*\|$/.test(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("12.3 insertItem");
    expect(rows[0]).toContain("8 timeLeftS");
  });
});
