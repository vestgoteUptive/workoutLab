// T-0692 UF-08.1 (D-0269): the simulated 14-day histories for rule 7.2 step 1 (AC7). A seeded
// mulberry32 harness drives the random cases (fast-check isn't in the lockfile, D-0036 §5).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  availableS,
  primaryAreas,
  rankCandidates,
  suggest,
  type Area,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, FULL_EQUIPMENT, NOW, TZ, input } from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";
import {
  BUDGETS,
  ENERGIES,
  LIBRARY_LOADED_ONLY,
  LIBRARY_PLUS,
  grid,
} from "./fixtures/main-loaded.js";
import { mulberry32 } from "./fixtures/random.js";

const BUDGET_MS = 120_000;
const SEED = 692_000;

const HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
  ["zero", []],
  ["balanced", SIMULATED_HISTORIES.balanced],
  ["allChestNoLegs", SIMULATED_HISTORIES.allChestNoLegs],
  ["returningAfter10Days", SIMULATED_HISTORIES.returningAfter10Days],
  ["offlineMerged", SIMULATED_HISTORIES.offlineMerged],
];
const LIB = new Map(LIBRARY_PLUS.map((e) => [e.id, e]));

function run(
  history: readonly HistorySet[],
  si: SessionInput,
  library: readonly LibraryExercise[] = LIBRARY_PLUS,
): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, library, si, NOW, TZ);
}

describe("rule 7.2 step 1 over the simulated 14-day histories (D-0269)", () => {
  it(
    "rule-7.2 (AC7a) caps hold and the result is deterministic: 5 histories × budgets × warm-up × energy × shuffle on L1+",
    () => {
      let cases = 0;
      for (const [name, h] of HISTORIES) {
        for (const si of grid()) {
          const label = `${name} ${si.budgetMin} ${si.warmupInBudget} ${si.energy} ${si.shuffle}`;
          const w = run(h, si);
          const items = w.plan.items;
          const available = Math.max(0, availableS(si.budgetMin, si.warmupInBudget));
          const sum = items.reduce((s, i) => s + i.costS, 0);
          expect(sum, `${label} Σ cost`).toBeLessThanOrEqual(available);
          expect(sum, `${label} itemsTotalS`).toBe(w.itemsTotalS);
          expect(w.unusedS, `${label} unusedS`).toBe(Math.max(0, available - sum));
          expect(items.length, `${label} items`).toBeLessThanOrEqual(8);
          const perArea = new Map<string, number>();
          for (const i of items) {
            for (const a of primaryAreas(LIB.get(i.exerciseId) as LibraryExercise)) {
              perArea.set(a, (perArea.get(a) ?? 0) + 1);
            }
          }
          for (const [a, n] of perArea) expect(n, `${label} ${a}`).toBeLessThanOrEqual(2);
          expect(run(h, si), `${label} determinism`).toEqual(w);
          cases++;
        }
      }
      expect(cases).toBe(5 * 22 * 2 * 3 * 7);
    },
    BUDGET_MS,
  );

  it(
    "rule-7.2 (AC7b) golden: on L1+ minus every bodyweight compound the whole matrix equals the snapshot from the unchanged engine",
    () => {
      const golden = JSON.parse(
        readFileSync(new URL("./fixtures/rule-7-main-loaded-golden.json", import.meta.url), "utf8"),
      ) as Record<string, string>;
      let cases = 0;
      for (const [name, h] of HISTORIES) {
        for (const si of grid()) {
          const label = `${name} ${si.budgetMin} ${si.warmupInBudget} ${si.energy} ${si.shuffle}`;
          const w = run(h, si, LIBRARY_LOADED_ONLY);
          const digest = createHash("sha256").update(JSON.stringify(w)).digest("hex").slice(0, 16);
          expect(digest, label).toBe(golden[label]);
          cases++;
        }
      }
      expect(cases).toBe(Object.keys(golden).length);
      expect(cases).toBe(5 * 22 * 2 * 3 * 7);
    },
    BUDGET_MS,
  );

  it("rule-7.2 (AC7c) the preference holds: one area left unavoided, for each of the nine areas", () => {
    const seen = { loaded: 0, bodyweight: 0, none: 0 };
    for (const equipment of [FULL_EQUIPMENT, []]) {
      const profile = { ...F_PROFILE, equipment };
      for (const budgetMin of [30, 60, 120]) {
        for (const area of AREAS) {
          const si = input({ budgetMin, avoidAreas: AREAS.filter((a): a is Area => a !== area) });
          const w = suggest([], F_TARGETS, profile, LIBRARY_PLUS, si, NOW, TZ);
          const ranked = rankCandidates(area, [], F_TARGETS, profile, LIBRARY_PLUS, si, NOW, TZ)
            .map((id) => LIB.get(id) as LibraryExercise)
            .filter((e) => e.type === "compound");
          const loaded = ranked.filter((e) => e.externalLoad);
          const label = `${area} ${budgetMin} ${equipment.length}`;
          if (loaded.length > 0) {
            expect(w.plan.mainLiftId, label).toBe((loaded[0] as LibraryExercise).id);
            expect(LIB.get(w.plan.mainLiftId as string)?.externalLoad, label).toBe(true);
            seen.loaded++;
          } else if (ranked.length > 0) {
            expect(w.plan.mainLiftId, label).toBe((ranked[0] as LibraryExercise).id);
            expect(LIB.get(w.plan.mainLiftId as string)?.externalLoad, label).toBe(false);
            seen.bodyweight++;
          } else {
            expect(w.plan.mainLiftId, label).toBeNull();
            seen.none++;
          }
        }
      }
    }
    // Not vacuous: all three kinds of area occur (bodyweight-only: core; none: calves, arms...).
    expect(seen.loaded).toBeGreaterThan(0);
    expect(seen.bodyweight).toBeGreaterThan(0);
    expect(seen.none).toBeGreaterThan(0);
  });

  it(
    "rule-7.2 (AC7d) seeded B5: up to 8 suggestion taps (first, last, seeded) never refuse a tap, on L1+",
    () => {
      const plan = (
        h: readonly HistorySet[],
        base: SessionInput,
        main: string | null,
        adds: string[],
      ) =>
        run(h, {
          ...base,
          shuffle: 0,
          mainLiftId: main,
          pinnedIds: [...adds],
          autoMainLift: false,
          fill: false,
        });
      let caseNo = 0;
      let totalTaps = 0;
      for (const [name, h] of HISTORIES.slice(0, 4)) {
        for (const budgetMin of BUDGETS) {
          for (const energy of ENERGIES) {
            const base = input({ budgetMin, energy });
            for (const strategy of ["first", "last", "seeded"] as const) {
              const seed = SEED + caseNo++;
              const rand = mulberry32(seed);
              const label = `seed ${seed} ${name} ${budgetMin} ${energy} ${strategy}`;
              let main: string | null = null;
              const adds: string[] = [];
              let current = plan(h, base, main, adds);
              expect(current.plan.items, label).toEqual([]);
              for (let tap = 0; tap < 8; tap++) {
                const have = new Set(current.plan.items.map((i) => i.exerciseId));
                const shuffle = strategy === "seeded" ? Math.floor(rand() * 7) : 0;
                const w = run(h, {
                  ...base,
                  shuffle,
                  mainLiftId: main,
                  pinnedIds: [...adds],
                  autoMainLift: main === null,
                  fill: true,
                });
                const rows = w.plan.items.filter((i) => !have.has(i.exerciseId));
                if (rows.length === 0) break;
                const row =
                  strategy === "first"
                    ? rows[0]
                    : strategy === "last"
                      ? rows[rows.length - 1]
                      : rows[Math.floor(rand() * rows.length)];
                if (row === undefined) break;
                if (row.isMain) main = row.exerciseId;
                else adds.push(row.exerciseId);
                current = plan(h, base, main, adds);
                const ids = current.plan.items.map((i) => i.exerciseId);
                const step = `${label} tap ${tap + 1} (${row.exerciseId})`;
                expect(ids, `${step} new item`).toContain(row.exerciseId);
                for (const id of adds) expect(ids, `${step} pick ${id}`).toContain(id);
                if (main !== null) expect(current.plan.mainLiftId, `${step} main`).toBe(main);
                totalTaps++;
              }
            }
          }
        }
      }
      expect(totalTaps).toBeGreaterThan(caseNo * 2);
    },
    BUDGET_MS,
  );
});
