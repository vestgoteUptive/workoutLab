// T-0534 UF-08.2 UF-11.5 (D-0199 §3, D-0200 §3): rule 0.1, part 2. The pure
// `excludedOutAreas` (R0-E3…E5), `suggest` with exclusions (R7-E17…E20), the three simulated
// 14-day histories with an exclusion, seeded properties (D-0036 §5: fast-check isn't in the
// lockfile, so mulberry32 drives the cases and a failure names its seed) and traceability.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  balance,
  checkinSessions,
  evaluateCheckin,
  excludedOutAreas,
  isEligible,
  primaryAreas,
  rankSwaps,
  suggest,
  type Area,
  type EngineProfile,
  type Energy,
  type HistorySet,
  type Level,
  type LibraryExercise,
  type SessionInput,
  type SwapReason,
  type Workout,
} from "@workoutlab/engine";
import { CHECKIN_TZ, F_CHECKIN, NO_CHECKINS, on, sessionRefsOf } from "./fixtures/checkin.js";
import {
  FULL_EQUIPMENT,
  F_PROFILE,
  F_TARGETS,
  L1,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
  itemsOf,
  profile,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const ENERGIES: Energy[] = ["low", "normal", "high"];
const REASONS: Array<SwapReason | null> = [
  null,
  "equipment_taken",
  "discomfort",
  "variety",
  "short_on_time",
];
const HISTORIES: Array<[string, HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES).map(([k, h]): [string, HistorySet[]] => [k, h]),
];

function run(
  history: readonly HistorySet[],
  si: SessionInput = input(),
  prof: EngineProfile = F_PROFILE,
): Workout {
  return suggest(history, F_TARGETS, prof, LIBRARY, si, NOW, TZ);
}

const out = (excludeIds: readonly string[], prof: Pick<EngineProfile, "level" | "equipment">) =>
  excludedOutAreas(prof, LIBRARY, excludeIds);

/** The primary (weight 1.0) areas of every item, in session order. */
function primariesOf(w: Workout): Area[] {
  return w.plan.items.flatMap((i) => primaryAreas(LIB.get(i.exerciseId) as LibraryExercise));
}

/** Every exercise id a workout names: items, the main lift and the warm-up. */
function idsIn(w: Workout): string[] {
  return [
    ...w.plan.items.map((i) => i.exerciseId),
    ...(w.plan.mainLiftId === null ? [] : [w.plan.mainLiftId]),
    ...w.plan.warmup.map((m) => m.exerciseId),
  ];
}

// ---- R0-E3…E5: excludedOutAreas (AC4) ----

describe("rule 0.1 excludedOutAreas (D-0199 §3, AC4)", () => {
  it("R0-E3 rule-0 F-profile excluding [calf-raise]: [calves]", () => {
    expect(out(["calf-raise"], F_PROFILE)).toEqual(["calves"]);
  });

  it("R0-E4 rule-0 F-profile excluding [bench-press, db-bench-press]: [] (push-up still covers chest)", () => {
    expect(out(["bench-press", "db-bench-press"], F_PROFILE)).toEqual([]);
  });

  it("R0-E5 rule-0 equipment [] excluding [push-up]: [chest]; back, already empty by equipment, is not reported", () => {
    const bare = profile({ equipment: [] });
    expect(out(["push-up"], bare)).toEqual(["chest"]);
    // Excluding a back exercise the profile can't use anyway reports nothing.
    expect(out(["push-up", "inverted-row", "barbell-row"], bare)).toEqual(["chest"]);
  });

  it("R0-E5 rule-0 excludeIds [] or [no-such-id]: []", () => {
    expect(out([], F_PROFILE)).toEqual([]);
    expect(out(["no-such-id"], F_PROFILE)).toEqual([]);
    expect(out([], profile({ equipment: [] }))).toEqual([]);
  });

  it("R0-E5 rule-0 level-empty areas are not reported; the result is in the fixed order", () => {
    // pull-up (intermediate) is the only pullup-bar back exercise: a beginner with only a
    // pullup-bar has no back exercise at all, so excluding pull-up reports nothing.
    const pullupOnly = profile({ equipment: ["pullup-bar"] });
    expect(out(["pull-up"], pullupOnly)).toEqual([]);
    expect(out(["pull-up"], { ...pullupOnly, level: "intermediate" })).toEqual(["back"]);
    // Input order core-first, output in the fixed order (chest before core).
    expect(out(["dead-bug", "plank", "hanging-knee-raise", "push-up"], pullupOnly)).toEqual([
      "chest",
      "core",
    ]);
  });

  it("R0-E3 rule-0 duplicates, order and unknown ids don't change the result; inputs are not mutated", () => {
    const ids = deepFreeze(["lateral-raise", "calf-raise", "overhead-press"]);
    const base = out(ids, F_PROFILE);
    expect(base).toEqual(["shoulders", "calves"]);
    expect(out([...ids].reverse(), F_PROFILE)).toEqual(base);
    expect(out([...ids, ...ids, "calf-raise"], F_PROFILE)).toEqual(base);
    expect(out(["zzz", ...ids, "wu-cat-cow"], F_PROFILE)).toEqual(base);
    expect(excludedOutAreas(deepFreeze(F_PROFILE), deepFreeze(LIBRARY), ids)).toEqual(base);
  });
});

// ---- R7-E17…E20: suggest with exclusions (AC1–AC3) ----

describe("rule 7.2 suggest with excludeIds (rule 0.1, D-0199 §3)", () => {
  it("R7-E17 rule-7 (AC1) R7-E4 excluding [bench-press]: db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2; 1545 s, unusedS 75", () => {
    const w = run([], input({ excludeIds: ["bench-press"] }));
    expect(itemsOf(w)).toEqual([
      ["db-bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.plan.items[0]?.isMain).toBe(true);
    expect(w.plan.mainLiftId).toBe("db-bench-press");
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
  });

  it("R7-E18 rule-7 (AC1) with mainLiftId bench-press as well: the excluded main lift is ignored, same result as R7-E17", () => {
    const excluded = run([], input({ excludeIds: ["bench-press"] }));
    const withMain = run([], input({ excludeIds: ["bench-press"], mainLiftId: "bench-press" }));
    expect(withMain).toEqual(excluded);
    expect(idsIn(withMain)).not.toContain("bench-press");
  });

  it("R7-E19 rule-7 (AC3) pinnedIds [plank] and excludeIds [plank]: plank is no item; deep-equal to pinnedIds []", () => {
    const pinned = run([], input({ pinnedIds: ["plank"], excludeIds: ["plank"] }));
    expect(idsIn(pinned)).not.toContain("plank");
    expect(pinned).toEqual(run([], input({ pinnedIds: [], excludeIds: ["plank"] })));
    // Without the exclusion the pin is honoured, so the exclusion is what removed it.
    expect(itemsOf(run([], input({ pinnedIds: ["plank"] }))).map(([id]) => id)).toContain("plank");
  });

  it("R7-E20 rule-7 (AC2) excluding [back-squat, leg-extension]: bench-press × 4, inverted-row × 3, leg-curl × 2; no quads at weight 1.0", () => {
    const w = run([], input({ excludeIds: ["back-squat", "leg-extension"] }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-curl", 2],
    ]);
    expect(w.plan.items[0]?.isMain).toBe(true);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
    expect(primariesOf(w)).not.toContain("quads");
    expect(out(["back-squat", "leg-extension"], F_PROFILE)).toEqual(["quads"]);
  });
});

// ---- AC5: the simulated 14-day histories with an exclusion ----

function balanceOf(history: readonly HistorySet[]) {
  return balance(history, F_TARGETS, LIBRARY, NOW, TZ);
}

function checkinOf(history: readonly HistorySet[]) {
  return evaluateCheckin(
    checkinSessions(sessionRefsOf(history), history, LIBRARY),
    F_CHECKIN,
    NO_CHECKINS,
    on("2026-09-27"),
    CHECKIN_TZ,
  );
}

describe("simulated 14-day histories with exclusions (AC5, engine-rules §Required tests)", () => {
  const cases: Array<[keyof typeof SIMULATED_HISTORIES, string[], Array<[string, number]>]> = [
    [
      "balanced",
      ["db-bench-press"],
      [
        ["push-up", 4],
        ["db-row", 3],
        ["leg-extension", 2],
      ],
    ],
    [
      "allChestNoLegs",
      ["inverted-row"],
      [
        ["barbell-row", 4],
        ["back-squat", 3],
        ["calf-raise", 2],
      ],
    ],
    [
      "returningAfter10Days",
      ["bench-press"],
      [
        ["db-bench-press", 4],
        ["inverted-row", 3],
        ["calf-raise", 2],
      ],
    ],
  ];

  for (const [name, excludeIds, expected] of cases) {
    it(`R7-E17 rule-0 (AC5) ${name} excluding [${excludeIds.join(", ")}]: ${expected.map(([id, n]) => `${id} × ${n}`).join(", ")}`, () => {
      const history = SIMULATED_HISTORIES[name];
      const w = run(history, input({ excludeIds }));
      expect(itemsOf(w)).toEqual(expected);
      expect(w.plan.items[0]?.isMain).toBe(true);
      for (const id of excludeIds) expect(idsIn(w)).not.toContain(id);
      // balance and evaluateCheckin take no exclusions; suggest reports balance's deficits.
      const b = balanceOf(history);
      for (const a of b.areas) expect(w.plan.startDeficits[a.area], a.area).toBe(a.deficit);
      expect(checkinOf(history)).toEqual(checkinOf(structuredClone(history)));
    });
  }

  it("R7-E17 rule-0 (AC5) allChestNoLegs excluding [db-bench-press] still counts its past sets (exclusion is not a history filter)", () => {
    const history = SIMULATED_HISTORIES.allChestNoLegs;
    expect(history.some((r) => r.exerciseId === "db-bench-press")).toBe(true);
    const plain = run(history);
    const excluded = run(history, input({ excludeIds: ["db-bench-press"] }));
    expect(excluded.plan.startDeficits.chest).toBe(plain.plan.startDeficits.chest);
    expect(excluded.plan.startDeficits).toEqual(plain.plan.startDeficits);
    // Dropping the db-bench-press rows instead would leave shoulders at 12/16 (deficit 0.25).
    expect(excluded.plan.startDeficits.shoulders).toBe(0);
    const filtered = history.filter((r) => r.exerciseId !== "db-bench-press");
    expect(run(filtered).plan.startDeficits.shoulders).toBe(0.25);
    expect(idsIn(excluded)).not.toContain("db-bench-press");
  });
});

// ---- AC6: seeded properties ----

const L1_IDS = L1.map((e) => e.id);
const UNKNOWN_IDS = ["no-such-id", "wu-cat-cow", "BENCH-PRESS", ""];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

function pickOne<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)] as T;
}

/** A random exclusion set: some single ids, sometimes every weight-1.0 exercise of an area. */
function randomExcludes(rand: () => number): string[] {
  const p = rand() * 0.5;
  const ids = L1_IDS.filter(() => rand() < p);
  const wipes = Math.floor(rand() * 3);
  for (let k = 0; k < wipes; k++) {
    const area = pickOne(rand, AREAS);
    ids.push(...L1.filter((e) => e.areas[area] === 1).map((e) => e.id));
  }
  return [...new Set(ids)];
}

function randomProfile(rand: () => number): EngineProfile {
  return profile({
    level: pickOne(rand, LEVELS),
    equipment: FULL_EQUIPMENT.filter(() => rand() < 0.7),
  });
}

function shuffled<T>(rand: () => number, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** The same set of ids, permuted, with duplicates and unknown ids mixed in. */
function noisy(rand: () => number, ids: readonly string[]): string[] {
  const dups = ids.filter(() => rand() < 0.5);
  const unknown = UNKNOWN_IDS.filter(() => rand() < 0.5);
  return shuffled(rand, [...ids, ...dups, ...unknown]);
}

function historyFor(rand: () => number, seed: number): HistorySet[] {
  const fixed = HISTORIES[seed % (HISTORIES.length + 1)];
  return fixed === undefined ? randomHistory(rand) : fixed[1];
}

/**
 * `excludeIds` names exercises (rule 0): a warm-up move id in it has no effect, since the
 * warm-up follows rule 7.3, so only ids of kind `exercise` count as excluded here.
 */
function expectNoExcluded(w: Workout, excludeIds: readonly string[], label: string): void {
  const excluded = excludeIds.filter((id) => LIB.get(id)?.kind === "exercise");
  const leaked = idsIn(w).filter((id) => excluded.includes(id));
  expect(leaked, `${label}: excluded id in the output`).toEqual([]);
}

function expectNoExcludedOutArea(w: Workout, areas: readonly Area[], label: string): void {
  const leaked = primariesOf(w).filter((a) => areas.includes(a));
  expect(leaked, `${label}: excluded-out area at weight 1.0`).toEqual([]);
}

describe("rule 0.1 seeded properties (AC6, D-0036 §5)", () => {
  it("rule-0 (AC6) no excluded id in any suggest output: budgets 15..120, every energy, warm-up on/off, shuffle 0..6, over every simulated history", () => {
    let checked = 0;
    for (const [hi, [name, history]] of HISTORIES.entries()) {
      const rand = mulberry32(53_400 + hi);
      const excludeIds = randomExcludes(rand);
      const outAreas = out(excludeIds, F_PROFILE);
      for (let budgetMin = 15; budgetMin <= 120; budgetMin += 5) {
        for (const energy of ENERGIES) {
          for (const warmupInBudget of [true, false]) {
            for (let shuffle = 0; shuffle <= 6; shuffle++) {
              const si = input({ budgetMin, energy, warmupInBudget, shuffle, excludeIds });
              const label = `${name} [${excludeIds.join(",")}] ${budgetMin} ${energy} ${warmupInBudget} ${shuffle}`;
              const w = run(history, si);
              expectNoExcluded(w, excludeIds, label);
              expectNoExcludedOutArea(w, outAreas, label);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(HISTORIES.length * 22 * 3 * 2 * 7);
  }, 120_000); // runtime budget only (sweep)

  it("rule-0 (AC6) no excluded id and no excluded-out area at weight 1.0, random histories, profiles and exclusions (400 seeds)", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rand = mulberry32(534_000 + seed);
      const history = historyFor(rand, seed);
      const prof = randomProfile(rand);
      const excludeIds = noisy(rand, randomExcludes(rand));
      const si = input({
        budgetMin: 15 + 5 * Math.floor(rand() * 22),
        energy: pickOne(rand, ENERGIES),
        warmupInBudget: rand() < 0.5,
        shuffle: Math.floor(rand() * 7),
        mainLiftId: rand() < 0.4 ? pickOne(rand, L1_IDS) : null,
        pinnedIds: L1_IDS.filter(() => rand() < 0.1),
        excludeIds,
      });
      const w = run(history, si, prof);
      expectNoExcluded(w, excludeIds, `seed ${seed}`);
      expectNoExcludedOutArea(w, out(excludeIds, prof), `seed ${seed}`);
    }
  }, 60_000); // runtime budget only (sweep)

  it("rule-0 (AC6) suggest and excludedOutAreas are invariant under permutation, duplication and unknown ids (300 seeds)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = mulberry32(534_500 + seed);
      const history = historyFor(rand, seed);
      const prof = randomProfile(rand);
      const ids = randomExcludes(rand);
      const variant = noisy(rand, ids);
      const base = input({
        budgetMin: 15 + 5 * Math.floor(rand() * 22),
        energy: pickOne(rand, ENERGIES),
        warmupInBudget: rand() < 0.5,
        shuffle: Math.floor(rand() * 7),
      });
      const label = `seed ${seed}`;
      expect(run(history, { ...base, excludeIds: variant }, prof), label).toEqual(
        run(history, { ...base, excludeIds: ids }, prof),
      );
      expect(out(variant, prof), label).toEqual(out(ids, prof));
    }
  }, 60_000); // runtime budget only (sweep)

  it("rule-0 (AC6) excludedOutAreas is in the fixed area order and monotone in excludeIds (500 seeds)", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = mulberry32(535_000 + seed);
      const prof = randomProfile(rand);
      const small = shuffled(rand, randomExcludes(rand));
      const big = shuffled(rand, [...small, ...randomExcludes(rand)]);
      const a = out(small, prof);
      const b = out(big, prof);
      const label = `seed ${seed} [${small.join(",")}] ⊆ [${big.join(",")}]`;
      expect(a, label).toEqual(AREAS.filter((x) => a.includes(x)));
      expect(b, label).toEqual(AREAS.filter((x) => b.includes(x)));
      expect(
        a.filter((x) => !b.includes(x)),
        label,
      ).toEqual([]);
      // The definition, per area: an eligible weight-1.0 exercise before, none after.
      for (const area of AREAS) {
        const covers = (ex: readonly string[]) =>
          LIBRARY.some((e) => e.areas[area] === 1 && isEligible(e, prof, ex));
        expect(b.includes(area), `${label} ${area}`).toBe(covers([]) && !covers(big));
      }
    }
  }, 30_000); // runtime budget only (sweep)

  it("rule-12 (AC6) rankSwaps(…, []) deep-equals the 8-argument call over random histories (150 seeds)", () => {
    let checked = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const rand = mulberry32(536_000 + seed);
      const history = historyFor(rand, seed);
      const session = run(history, input({ budgetMin: 15 + 5 * Math.floor(rand() * 22) }));
      for (const item of session.plan.items) {
        const reason = pickOne(rand, REASONS);
        const args = [
          item.exerciseId,
          reason,
          session,
          F_PROFILE,
          LIBRARY,
          history,
          NOW,
          TZ,
        ] as const;
        expect(rankSwaps(...args, []), `seed ${seed}`).toEqual(rankSwaps(...args));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000); // runtime budget only (sweep)
});

// ---- AC8: traceability ----

describe("T-0534 traceability (AC8)", () => {
  it("rule-0 (AC8) rule 0 lists excludedOutAreas and rule 0.1 carries R0-E3…E5", () => {
    const r0 = doc.slice(doc.indexOf("## 0. "), doc.indexOf("## 1. "));
    const list = r0.split("\n").find((l) => l.startsWith("- All engine functions are pure"));
    expect(list).toContain("excludedOutAreas(profile, library, excludeIds)");
    const r01 = r0.slice(r0.indexOf("### 0.1 "));
    for (const id of ["R0-E3", "R0-E4", "R0-E5"]) {
      expect(r01.split("\n").filter((l) => l.startsWith(`- **${id}`))).toHaveLength(1);
    }
  });

  it("rule-7 (AC8) rule 7.2 carries R7-E17…E20", () => {
    const r72 = doc.slice(doc.indexOf("### 7.2 "), doc.indexOf("### 7.3 "));
    for (const id of ["R7-E17", "R7-E18", "R7-E19", "R7-E20"]) {
      expect(r72.split("\n").filter((l) => l.startsWith(`- **${id} `))).toHaveLength(1);
    }
  });

  it("rule-0 (AC8) Required tests name the three histories with exclusions; one T-0534 Traceability row", () => {
    const required = doc.slice(doc.indexOf("## Required tests"), doc.indexOf("## Traceability"));
    expect(required).toContain(
      "balanced excluding db-bench-press → push-up × 4, db-row × 3, leg-extension × 2",
    );
    expect(required).toContain(
      "all-chest-no-legs excluding inverted-row → barbell-row × 4, back-squat × 3, calf-raise × 2",
    );
    expect(required).toContain(
      "returning after 10 days off excluding bench-press → db-bench-press × 4, inverted-row × 3, calf-raise × 2",
    );
    const table = doc.slice(doc.indexOf("## Traceability"));
    const rows = table.split("\n").filter((l) => /^\|.*\|\s*T-0534\s*\|$/.test(l));
    expect(rows).toEqual([
      "| 0.1 excludedOutAreas, suggest with exclusions (R0-E3…E5, R7-E17…E20, D-0199 §3) | T-0534 |",
    ]);
  });

  it("rule-0 (AC8) excludedOutAreas is exported from @workoutlab/engine", () => {
    expect(typeof excludedOutAreas).toBe("function");
    expect(excludedOutAreas.length).toBe(3);
  });
});
