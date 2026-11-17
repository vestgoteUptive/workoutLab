// T-0945 UF-09.10: seeded properties for rule 12.3 `insertItem` and rule 8 `timeLeftS`
// (D-0246 §13). AC24–AC27. ≥ 200 cases each, driven by `mulberry32` (fast-check isn't a
// dependency, D-0036 §5); every failure message names the case seed, so
// `mulberry32(seed)` replays it.
import { describe, expect, it } from "vitest";
import {
  removeItem,
  suggest,
  timeCheck,
  timeLeftS,
  type HistorySet,
  type InsertResult,
  type TimeLeftProgress,
  type Workout,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, LIBRARY, NOW, TZ, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import { insert, notInPlan, progressAfterInsert } from "./fixtures/insert-p.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

const BASE_SEED = 0x7945;
const MIN_CASES = 200;
const MAX_TRIES = 6000;
/** T-0230 (D-0096): every seeded test carries an explicit runtime budget. */
const BUDGET_MS = 30_000;

const ENERGIES = ["low", "normal", "high"] as const;
const FIXED_HISTORIES: readonly (readonly HistorySet[])[] = [
  [],
  SIMULATED_HISTORIES.balanced,
  SIMULATED_HISTORIES.allChestNoLegs,
  SIMULATED_HISTORIES.returningAfter10Days,
  SIMULATED_HISTORIES.offlineMerged,
];

const int = (rand: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

interface Case {
  seed: number;
  history: readonly HistorySet[];
  w: Workout;
  p: TimeLeftProgress;
}

/** A suggested plan (sometimes with items removed) and a random point in the workout. */
function randomCase(seed: number): Case {
  const rand = mulberry32(seed);
  const history = rand() < 0.3 ? randomHistory(rand) : pick(rand, FIXED_HISTORIES);
  let w = suggest(
    history,
    F_TARGETS,
    F_PROFILE,
    LIBRARY,
    input({
      budgetMin: int(rand, 3, 24) * 5,
      warmupInBudget: rand() < 0.7,
      energy: pick(rand, ENERGIES),
      shuffle: int(rand, 0, 6),
    }),
    NOW,
    TZ,
  );
  // Sometimes free slots, so the 8-item cap doesn't swallow the 90–120 min cases.
  const drops = rand() < 0.5 ? int(rand, 0, Math.min(3, w.plan.items.length)) : 0;
  for (let d = 0; d < drops; d++) {
    w = removeItem(w, pick(rand, w.plan.items).exerciseId);
  }
  const n = w.plan.items.length;
  const next = int(rand, 0, n);
  const setsDone = w.plan.items.map((it, i) => {
    const all = it.sets + (it.backoff === null ? 0 : 1);
    if (i < next) return all + (rand() < 0.1 ? 1 : 0);
    if (i === next) return int(rand, 0, all);
    return rand() < 0.15 ? int(rand, 1, all) : 0; // logged ahead from List view
  });
  const skippedItems = w.plan.items.map((_, i) => i).filter((i) => i > next && rand() < 0.15);
  const warmupLeftS = w.warmupInBudget && next === 0 && setsDone[0] === 0 ? int(rand, 0, 180) : 0;
  const elapsedS = int(rand, 0, Math.round(w.budgetMin * 60 * 0.8));
  return { seed, history, w, p: { elapsedS, setsDone, skippedItems, warmupLeftS } };
}

/** Runs `check` on random successful inserts until `MIN_CASES` of them have passed. */
function forInserts(
  salt: number,
  check: (
    c: Case,
    r: InsertResult & { workout: Workout },
    id: string,
    at: number,
    leftS: number,
  ) => void,
): number {
  let passed = 0;
  for (let t = 0; t < MAX_TRIES && passed < MIN_CASES; t++) {
    const seed = BASE_SEED + salt * 100_000 + t;
    const c = randomCase(seed);
    const rand = mulberry32(seed ^ 0x5eed);
    const candidates = notInPlan(c.w);
    if (candidates.length === 0) continue;
    const id = pick(rand, candidates).id;
    const at = int(rand, 0, c.w.plan.items.length);
    const leftS = timeLeftS(c.w, c.p);
    const r = insert(c.w, id, at, leftS, c.history);
    if (r.workout === undefined) {
      // Refusals are honest: the cap at 8, otherwise even 2 sets don't fit.
      if (c.w.plan.items.length >= 8)
        expect(r, `seed ${seed}`).toStrictEqual({ refused: "items_cap" });
      else expect(r, `seed ${seed}`).toStrictEqual({ refused: "time" });
      continue;
    }
    check(c, r, id, at, leftS);
    passed++;
  }
  return passed;
}

describe("rule 12.3 seeded properties (AC24–AC26)", () => {
  it(
    "rule-12.3 rule-8 (AC24) after an insert, timeLeftS drops by exactly the item's costS and stays ≥ 0",
    () => {
      const passed = forInserts(1, (c, r, _id, at, leftS) => {
        const added = r.workout.plan.items[at]!;
        const after = timeLeftS(r.workout, progressAfterInsert(c.p, at));
        expect(after, `seed ${c.seed}`).toBe(leftS - added.costS);
        expect(after, `seed ${c.seed}`).toBeGreaterThanOrEqual(0);
        expect(r.workout.plan.items.length, `seed ${c.seed}`).toBeLessThanOrEqual(8);
        const ids = r.workout.plan.items.map((i) => i.exerciseId);
        expect(new Set(ids).size, `seed ${c.seed}`).toBe(ids.length);
      });
      expect(passed).toBeGreaterThanOrEqual(MIN_CASES);
    },
    BUDGET_MS,
  );

  it(
    "rule-12.3 (AC25) every other item and the warm-up deep-equal their pre-insert values",
    () => {
      const passed = forInserts(2, (c, r, id, at) => {
        expect(r.workout.plan.items[at]!.exerciseId, `seed ${c.seed}`).toBe(id);
        expect(
          r.workout.plan.items.filter((_, i) => i !== at),
          `seed ${c.seed}`,
        ).toStrictEqual(c.w.plan.items);
        expect(r.workout.plan.warmup, `seed ${c.seed}`).toStrictEqual(c.w.plan.warmup);
        expect(r.workout.sessionReasons, `seed ${c.seed}`).toStrictEqual(c.w.sessionReasons);
        expect(r.workout.plan.startDeficits, `seed ${c.seed}`).toStrictEqual(
          c.w.plan.startDeficits,
        );
        expect(r.workout.plan.mainLiftId, `seed ${c.seed}`).toBe(c.w.plan.mainLiftId);
      });
      expect(passed).toBeGreaterThanOrEqual(MIN_CASES);
    },
    BUDGET_MS,
  );

  it(
    "rule-12.3 rule-12.2 (AC26) insert then removeItem of the same index round-trips deep-equal",
    () => {
      const passed = forInserts(3, (c, r, _id, at) => {
        const back = removeItem(r.workout, r.workout.plan.items[at]!.exerciseId);
        expect(back, `seed ${c.seed}`).toStrictEqual(c.w);
      });
      expect(passed).toBeGreaterThanOrEqual(MIN_CASES);
    },
    BUDGET_MS,
  );
});

describe("rule 8 seeded consistency with timeCheck (AC27)", () => {
  it(
    "rule-8 (AC27) between exercises, nothing logged ahead and nothing skipped: timeLeftS = −timeCheck.behindS",
    () => {
      let passed = 0;
      for (let t = 0; t < MIN_CASES * 2; t++) {
        const seed = BASE_SEED + 4 * 100_000 + t;
        const c = randomCase(seed);
        const rand = mulberry32(seed ^ 0xbeef);
        const next = int(rand, 0, c.w.plan.items.length);
        const setsDone = c.w.plan.items.map((it, i) =>
          i < next ? it.sets + (it.backoff === null ? 0 : 1) + (rand() < 0.1 ? 1 : 0) : 0,
        );
        const p: TimeLeftProgress = {
          elapsedS: c.p.elapsedS,
          setsDone,
          skippedItems: [],
          warmupLeftS: 0,
        };
        const { behindS } = timeCheck(c.w, { elapsedS: c.p.elapsedS, nextItemIndex: next });
        expect(timeLeftS(c.w, p), `seed ${seed}`).toBe(-behindS);
        passed++;
      }
      expect(passed).toBeGreaterThanOrEqual(MIN_CASES);
    },
    BUDGET_MS,
  );
});
