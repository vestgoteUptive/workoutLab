// T-0201a UF-08.1 UF-08.3: rule 0 eligibility, rule 7.1–7.3 session building, rule 10
// reasons and the D-0037 §7 Workout shape. AC1–AC13, AC15–AC17, AC21.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  availableS,
  balance,
  isEligible,
  itemCostS,
  rankCandidates,
  suggest,
  type LibraryExercise,
  type SessionInput,
  type Workout,
  type HistorySet,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  HOUR,
  L1,
  LIBRARY,
  NOW,
  TZ,
  input,
  itemsOf,
  profile,
  setsAt,
  setsOn,
  shift,
  warmupOf,
} from "./fixtures/common.js";
import { allChestNoLegsHistory } from "./fixtures/histories.js";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function run(
  overrides: Partial<SessionInput> = {},
  history: HistorySet[] = [],
  prof = F_PROFILE,
  library: LibraryExercise[] = LIBRARY,
): Workout {
  return suggest(history, F_TARGETS, prof, library, input(overrides), NOW, TZ);
}

function byId(id: string): LibraryExercise {
  const found = LIBRARY.find((e) => e.id === id);
  if (!found) throw new Error(`fixture: ${id}`);
  return found;
}

function item(w: Workout, id: string) {
  const found = w.plan.items.find((i) => i.exerciseId === id);
  if (!found) throw new Error(`item ${id} missing`);
  return found;
}

/** No item has one of `areas` at weight 1.0. */
function noPrimaryIn(w: Workout, areas: string[]): boolean {
  return w.plan.items.every((i) =>
    areas.every((a) => byId(i.exerciseId).areas[a as keyof LibraryExercise["areas"]] !== 1),
  );
}

const RECOVERING_SQUATS = setsAt(6, "back-squat", shift(NOW, -24 * HOUR));

describe("rule 0: eligible exercise (D-0034 §7, D-0040 §1)", () => {
  it("rule-0 (AC1) level, equipment, warm-up kind, 'none' equipment and excludeIds", () => {
    const eligible = (p = F_PROFILE, ex: readonly string[] = []) =>
      LIBRARY.filter((e) => isEligible(e, p, ex)).map((e) => e.id);
    const full = eligible();
    expect(full).not.toContain("pull-up");
    expect(full).toContain("hanging-knee-raise");
    for (const w of LIBRARY.filter((e) => e.kind === "warmup")) {
      expect(isEligible(w, F_PROFILE)).toBe(false);
    }
    expect(eligible(profile({ level: "intermediate" }))).toContain("pull-up");
    expect(eligible(profile({ equipment: [] })).sort()).toEqual(["dead-bug", "plank", "push-up"]);
    expect(eligible(profile({ equipment: ["none"] })).sort()).toEqual([
      "dead-bug",
      "plank",
      "push-up",
    ]);
    const noneTagged: LibraryExercise = { ...byId("push-up"), id: "t-none", equipment: ["none"] };
    expect(isEligible(noneTagged, profile({ equipment: [] }))).toBe(true);
    const badSpelling: LibraryExercise = {
      ...byId("pull-up"),
      id: "t-bar",
      level: "beginner",
      equipment: ["pull-up-bar"],
    };
    expect(isEligible(badSpelling, F_PROFILE)).toBe(false);
    expect(isEligible(byId("bench-press"), F_PROFILE, ["bench-press"])).toBe(false);
    expect(eligible(F_PROFILE, ["bench-press"])).not.toContain("bench-press");
  });

  it("rule-0 (AC2) excludeIds removes bench-press, so db-bench-press × 4 is the 15-min plan", () => {
    expect(itemsOf(run({ budgetMin: 15, excludeIds: ["bench-press"] }))).toEqual([
      ["db-bench-press", 4],
    ]);
  });
});

describe("rule 7.1: time model", () => {
  it("R7-E1 rule-7 (AC3) item costs and available time", () => {
    expect(itemCostS(byId("back-squat"), 4)).toBe(720);
    expect(itemCostS(byId("leg-curl"), 3)).toBe(375);
    expect(itemCostS(byId("plank"), 2)).toBe(270);
    expect(availableS(30, true)).toBe(1620);
    expect(availableS(30, false)).toBe(1800);
  });
});

describe("rule 7.2: main lift and greedy selection", () => {
  it("R7-E2 rule-7 (AC4) 15 min, zero history: bench-press × 4", () => {
    const w = run({ budgetMin: 15 });
    expect(itemsOf(w)).toEqual([["bench-press", 4]]);
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(w.itemsTotalS).toBe(720);
    expect(w.totalS).toBe(900);
  });

  it("R7-E3 rule-7 (AC5) recovering quads and glutes are skipped", () => {
    const w = run({}, RECOVERING_SQUATS);
    expect(w.plan.items[0]?.exerciseId).toBe("bench-press");
    expect(w.plan.items[0]?.isMain).toBe(true);
    expect(noPrimaryIn(w, ["quads", "glutes"])).toBe(true);
    expect(w.sessionReasons).toEqual([
      { code: "recovering_skipped", area: "glutes" },
      { code: "recovering_skipped", area: "quads" },
      { code: "area_deficit", area: "chest", deficit: 1 },
    ]);
  });

  it("R7-E4 rule-7 (AC6) 30 min, zero history", () => {
    const w = run();
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(item(w, "bench-press").isMain).toBe(true);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.totalS).toBe(1725);
    expect(w.unusedS).toBe(75);
  });

  it("R7-E5 rule-7 (AC7) 20 min with mainLiftId keeps the main lift", () => {
    expect(itemsOf(run({ budgetMin: 20, mainLiftId: "bench-press" }))).toEqual([
      ["bench-press", 4],
      ["straight-arm-pulldown", 2],
    ]);
  });

  it("R7-E6 rule-7 (AC8) no equipment: push-up × 4 at 6 reps, 0 kg", () => {
    const w = run({ budgetMin: 15 }, [], profile({ equipment: [] }));
    expect(itemsOf(w)).toEqual([["push-up", 4]]);
    const pu = item(w, "push-up");
    expect(pu.repsMin).toBe(6);
    expect(pu.prefill).toEqual({ weightKg: 0, reps: 6, durationS: null, kind: "first_time" });
  });

  it("R7-E7 rule-7 (AC9) the most recent session ranks last", () => {
    const history = setsOn(3, "inverted-row", "2026-09-25");
    expect(
      rankCandidates("back", history, F_TARGETS, F_PROFILE, LIBRARY, input(), NOW, TZ),
    ).toEqual([
      "barbell-row",
      "db-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
      "inverted-row",
    ]);
  });

  it("rule-7 (AC10) an unusable mainLiftId falls back to the automatic choice", () => {
    const w = run({ mainLiftId: "back-squat" }, RECOVERING_SQUATS);
    expect(w.plan.mainLiftId).toBe("bench-press");
    const ac6 = run();
    expect(run({ mainLiftId: "no-such-id" })).toEqual(ac6);
    expect(run({ mainLiftId: "leg-extension" })).toEqual(ac6);
  });

  it("rule-7 (AC11) pinned exercises follow the main lift; duplicates and ineligible pins are skipped", () => {
    const w = run({ pinnedIds: ["biceps-curl"] });
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["biceps-curl", 3],
      ["inverted-row", 2],
    ]);
    expect(w.itemsTotalS).toBe(1485);
    expect(w.unusedS).toBe(135);
    expect(run({ pinnedIds: ["bench-press", "pull-up"] })).toEqual(run());
  });

  it("rule-7 (AC12) all-chest history: back main lift, then glutes and calves (D-0040 §11)", () => {
    const w = run({}, allChestNoLegsHistory);
    expect(itemsOf(w)).toEqual([
      ["inverted-row", 4],
      ["back-squat", 3],
      ["calf-raise", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("inverted-row");
    expect(w.itemsTotalS).toBe(1545);
    expect(w.totalS).toBe(1725);
    expect(w.unusedS).toBe(75);
    expect(w.sessionReasons).toEqual([
      { code: "recovering_skipped", area: "chest" },
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "area_deficit", area: "glutes", deficit: 1 },
    ]);
    expect(noPrimaryIn(w, ["chest"])).toBe(true);
  });

  it("rule-7 (AC13) a budget too small for anything is not an error; bad budgets throw", () => {
    const w = run({ budgetMin: 5 });
    expect(w.plan.items).toEqual([]);
    expect(w.plan.mainLiftId).toBeNull();
    expect(w.itemsTotalS).toBe(0);
    expect(w.totalS).toBe(180);
    expect(w.unusedS).toBe(120);
    expect(warmupOf(w)).toEqual([
      "wu-jumping-jack",
      "wu-march-in-place",
      "wu-arm-circle",
      "wu-band-pull-apart",
    ]);
    expect(run({ budgetMin: 2 }).unusedS).toBe(0);
    for (const budgetMin of [0, 481, 30.5]) {
      expect(() => run({ budgetMin })).toThrow(RangeError);
    }
  });
});

// The real `data/exercises` warm-up rows, read-only, mapped to LibraryExercise (D-0040 §2).
interface LibraryJson {
  id: string;
  name: string;
  kind: "exercise" | "warmup";
  type: "compound" | "isolation";
  level: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  areas: LibraryExercise["areas"];
  bodyweight?: boolean;
  timed?: boolean;
  default_duration_s?: number | null;
  increment_kg?: number | null;
}

function realRow(id: string): LibraryExercise {
  const file = path.join(REPO_DIR, "data", "exercises", "library", `${id}.json`);
  const j = JSON.parse(readFileSync(file, "utf8")) as LibraryJson;
  return {
    id: j.id,
    name: j.name,
    kind: j.kind,
    type: j.type,
    level: j.level,
    equipment: j.equipment,
    areas: j.areas,
    timed: j.timed ?? false,
    defaultDurationS: j.default_duration_s ?? null,
    incrementKg: j.increment_kg ?? null,
    externalLoad: j.bodyweight !== true,
  };
}

describe("rule 7.3: warm-up (D-0004, D-0040 §2)", () => {
  it("R7-E9 R7-E10 rule-7 (AC15) warm-up moves follow the items' primary areas", () => {
    expect(warmupOf(run({ budgetMin: 15 }))).toEqual([
      "wu-scap-push-up",
      "wu-arm-circle",
      "wu-jumping-jack",
      "wu-march-in-place",
    ]);
    expect(warmupOf(run())).toEqual([
      "wu-scap-push-up",
      "wu-band-pull-apart",
      "wu-bodyweight-squat",
      "wu-arm-circle",
    ]);
    const chest = run({}, allChestNoLegsHistory);
    expect(warmupOf(chest)).toEqual([
      "wu-band-pull-apart",
      "wu-bodyweight-squat",
      "wu-cat-cow",
      "wu-leg-swing",
    ]);
    for (const w of [run({ budgetMin: 15 }), run(), chest]) {
      for (const m of w.plan.warmup) expect(m.durationS).toBe(40);
    }
  });

  it("rule-7 (AC16) the real library's 4 warm-up rows, and a 2-row library", () => {
    const real = ["cat-cow", "hip-circles", "jumping-jacks", "arm-circles"].map(realRow);
    for (const r of real) expect(r.kind).toBe("warmup");
    const ac6 = run();
    const w = run({}, [], F_PROFILE, [...L1, ...real]);
    expect(w.plan.items).toEqual(ac6.plan.items);
    expect(warmupOf(w)).toEqual(["cat-cow", "hip-circles", "arm-circles", "jumping-jacks"]);
    const two = real.filter((r) => r.id === "jumping-jacks" || r.id === "arm-circles");
    const w2 = run({}, [], F_PROFILE, [...L1, ...two]);
    expect(warmupOf(w2)).toEqual(["arm-circles", "jumping-jacks"]);
    expect(w2.totalS).toBe(w2.itemsTotalS + 180);
  });
});

describe("rule 10: reasons (D-0040 §6)", () => {
  it("R10-E1 rule-10 (AC17) item reasons and sessionReasons for the 30-min plan", () => {
    const w = run();
    expect(item(w, "bench-press").reasons).toEqual([
      { code: "main_lift" },
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "days_since", area: "chest", days: null },
      { code: "prefill", kind: "first_time" },
    ]);
    expect(item(w, "inverted-row").reasons).toEqual([
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "days_since", area: "back", days: null },
      { code: "prefill", kind: "first_time" },
    ]);
    expect(w.sessionReasons).toEqual([
      { code: "area_deficit", area: "chest", deficit: 1 },
      { code: "area_deficit", area: "back", deficit: 1 },
      { code: "area_deficit", area: "quads", deficit: 1 },
    ]);
  });
});

describe("Workout shape (D-0037 §7)", () => {
  it("rule-7 (AC21) exact keys, rep ranges, pre-fill and a timed item", () => {
    const w = run();
    expect(Object.keys(w).sort()).toEqual(
      [
        "plan",
        "budgetMin",
        "warmupInBudget",
        "energy",
        "itemsTotalS",
        "totalS",
        "unusedS",
        "sessionReasons",
      ].sort(),
    );
    expect(Object.keys(w.plan).sort()).toEqual(
      ["version", "mainLiftId", "warmup", "items", "startDeficits"].sort(),
    );
    expect(w.plan.version).toBe(1);
    const bal = balance([], F_TARGETS, LIBRARY, NOW, TZ);
    expect(Object.keys(w.plan.startDeficits)).toHaveLength(9);
    for (const a of AREAS) {
      expect(w.plan.startDeficits[a]).toBe(bal.areas.find((x) => x.area === a)?.deficit);
    }
    const itemKeys = [
      "exerciseId",
      "isMain",
      "sets",
      "repsMin",
      "repsMax",
      "durationS",
      "costS",
      "backoff",
      "prefill",
      "reasons",
    ].sort();
    for (const i of w.plan.items) {
      expect(Object.keys(i).sort()).toEqual(itemKeys);
      expect(i.backoff).toBeNull();
    }
    const reps = (id: string) => [item(w, id).repsMin, item(w, id).repsMax];
    expect(reps("bench-press")).toEqual([6, 8]);
    expect(reps("inverted-row")).toEqual([8, 12]);
    expect(reps("leg-extension")).toEqual([10, 15]);
    expect(item(w, "bench-press").prefill.weightKg).toBeNull();
    expect(item(w, "bench-press").prefill.reps).toBe(6);

    const plank = item(run({ pinnedIds: ["plank"] }), "plank");
    expect(plank.sets).toBe(3);
    expect(plank.costS).toBe(375);
    expect(plank.repsMin).toBeNull();
    expect(plank.repsMax).toBeNull();
    expect(plank.durationS).toBe(45);
    expect(plank.prefill.durationS).toBe(45);
  });
});
