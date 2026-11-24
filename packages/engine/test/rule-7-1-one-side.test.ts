// T-0978b UF-08.1, UF-09.3 (D-0268): rule 7.1 prices a flagged one-side set at two sides of work
// (non-timed 90 s, timed twice its planned duration); rest and the transition are unchanged.
// R7-E43…R7-E45 and AC4…AC7, AC9. The simulated histories are rule-7-1-one-side-histories.test.ts.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applySwap,
  balance,
  estimatedOneRepMax,
  insertItem,
  itemCostS,
  prefill,
  rankSwaps,
  records,
  removeItem,
  setCostS,
  suggest,
  timeCheck,
  timeLeftS,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "../src/index.js";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  input,
  itemsOf,
  setsOn,
  setsWithReps,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES, balancedHistory } from "./fixtures/histories.js";
import { L1_ONE, allFlagged, flagged, itemFormula, oneSide } from "./fixtures/one-side.js";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function run(
  lib: readonly LibraryExercise[],
  si: Partial<SessionInput> = {},
  history: readonly HistorySet[] = [],
): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, lib, input(si), NOW, TZ);
}
const PICK = { autoMainLift: false, fill: false } as const;
const byId = (lib: readonly LibraryExercise[], id: string): LibraryExercise =>
  lib.find((e) => e.id === id) as LibraryExercise;

describe("rule 7.1 one side at a time (D-0268)", () => {
  it("rule-7.1 (AC1) R7-E43 a flagged compound costs two sides of work", () => {
    const w = run(L1_ONE, { pinnedIds: ["db-row"], ...PICK });
    expect(itemsOf(w)).toEqual([["db-row", 3]]);
    // 3 × (90 + 120) + 60.
    expect([w.plan.items[0]?.costS, w.itemsTotalS, w.unusedS]).toEqual([690, 690, 930]);
    const plain = run(LIBRARY, { pinnedIds: ["db-row"], ...PICK });
    expect([plain.plan.items[0]?.costS, plain.unusedS]).toEqual([555, 1065]);
    expect(690 - 555).toBe(135);
  });

  it("rule-7.1 (AC2) R7-E44 a flagged timed hold costs twice its planned duration", () => {
    const w = run(L1_ONE, { pinnedIds: ["plank"], ...PICK });
    const item = w.plan.items[0];
    expect([item?.exerciseId, item?.sets, item?.durationS, item?.costS]).toEqual([
      "plank",
      3,
      45,
      510,
    ]);
    expect(run(LIBRARY, { pinnedIds: ["plank"], ...PICK }).plan.items[0]?.costS).toBe(375);

    const hist = setsWithReps("2026-09-24", "plank", [
      { durationS: 115 },
      { durationS: 115 },
      { durationS: 115 },
    ]);
    const si = {
      budgetMin: 20,
      warmupInBudget: false,
      pinnedIds: ["plank"],
      autoMainLift: true,
      fill: false,
    } as const;
    const f = run(L1_ONE, si, hist);
    expect(itemsOf(f)).toEqual([["bench-press", 4]]);
    const p = run(LIBRARY, si, hist);
    expect(itemsOf(p)).toEqual([
      ["bench-press", 4],
      ["plank", 2],
    ]);
    expect(p.plan.items[1]?.durationS).toBe(120);
    expect(p.plan.items[1]?.costS).toBe(420);
    // Planned 120 s flagged × 2 = 2 × (240 + 60) + 60 = 660 > 480 left.
    expect(itemFormula(byId(L1_ONE, "plank"), 2, 120)).toBe(660);
  });

  it("rule-7.1 (AC3) R7-E45 the time fit moves: every cost is the independent formula", () => {
    const w = run(L1_ONE, { pinnedIds: ["db-row"] });
    const available = 30 * 60 - 180;
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["db-row", 3],
    ]);
    for (const i of w.plan.items) {
      expect(i.costS).toBe(itemFormula(byId(L1_ONE, i.exerciseId), i.sets, i.durationS));
    }
    expect(w.plan.items.reduce((s, i) => s + i.costS, 0)).toBeLessThanOrEqual(available);
    expect([w.itemsTotalS, w.unusedS]).toEqual([1410, 210]);
  });

  it("rule-7.1 (AC4) a back-off set is a set and costs the same", () => {
    const si = {
      budgetMin: 20,
      warmupInBudget: false,
      energy: "high",
      mainLiftId: "db-row",
      ...PICK,
    } as const;
    const f = run(L1_ONE, si).plan.items[0];
    expect([f?.exerciseId, f?.sets, f?.backoff === null]).toEqual(["db-row", 4, false]);
    const db = byId(L1_ONE, "db-row");
    expect(f?.costS).toBe(itemCostS(db, 4) + setCostS(db));
    expect(f?.costS).toBe(1110);
    expect(run(LIBRARY, si).plan.items[0]?.costS).toBe(885);
    // budget 15: 900 − 900 = 0 < 210, so no back-off.
    const f15 = run(L1_ONE, { ...si, budgetMin: 15 }).plan.items[0];
    expect([f15?.sets, f15?.backoff, f15?.costS]).toEqual([4, null, 900]);
  });

  it("rule-7.1 (AC5) every consumer prices the flagged row the same way", () => {
    const w = run(L1_ONE, { pinnedIds: ["db-row"], ...PICK });
    const swap = (from: string, to: string, plan: Workout): Workout =>
      applySwap(plan, from, to, null, [], F_PROFILE, L1_ONE, NOW, TZ);
    const toLat = swap("db-row", "lat-pulldown", w);
    expect(toLat.plan.items[0]?.costS).toBe(555);
    expect(swap("lat-pulldown", "db-row", toLat).plan.items[0]?.costS).toBe(690);

    // The rule 12 fit check: a 690 s candidate does not fit 689 s left, and fits 690 s.
    const base = run(L1_ONE, { pinnedIds: ["lat-pulldown"], ...PICK });
    const start = base.plan.items.length;
    expect(start).toBe(1);
    const tight = (leftS: number) =>
      insertItem(base, "db-row", { atIndex: 1, leftS }, [], F_PROFILE, L1_ONE, NOW, TZ);
    expect(tight(689).workout?.plan.items[1]?.sets).toBe(2);
    const fit = tight(690);
    expect(fit.workout?.plan.items[1]?.sets).toBe(3);
    expect(fit.workout?.plan.items[1]?.costS).toBe(3 * 210 + 60);

    const ranked = rankSwaps("lat-pulldown", null, base, F_PROFILE, L1_ONE, [], NOW, TZ);
    expect(ranked.find((c) => c.exerciseId === "db-row")?.timeCostS).toBe(690);
    const rankedPlain = rankSwaps("lat-pulldown", null, base, F_PROFILE, LIBRARY, [], NOW, TZ);
    expect(rankedPlain.find((c) => c.exerciseId === "db-row")?.timeCostS).toBe(555);

    const two = run(L1_ONE, { pinnedIds: ["db-row", "plank"], ...PICK });
    expect(two.itemsTotalS).toBe(690 + 510);
    const removed = removeItem(two, "plank");
    expect([removed.itemsTotalS, removed.unusedS]).toEqual([690, 930]);

    const progress = { elapsedS: 0, nextItemIndex: 0 };
    const tc = timeCheck(two, progress);
    expect(tc.behindS).toBe(690 + 510 - 30 * 60);
    expect(timeLeftS(w, { elapsedS: 0, setsDone: [0], skippedItems: [], warmupLeftS: 180 })).toBe(
      30 * 60 - 180 - 690,
    );
    // Per-set cost (costS − 60) / sets is the integer 210; one set done leaves 2 × 210.
    expect(timeLeftS(w, { elapsedS: 0, setsDone: [1], skippedItems: [], warmupLeftS: 0 })).toBe(
      30 * 60 - 420,
    );
  });

  it("rule-7.1 (AC6) the flag absent, null or unknown changes nothing, and nothing throws", () => {
    const histories: HistorySet[][] = [
      [],
      ...Object.values(SIMULATED_HISTORIES).map((h) => [...h]),
    ];
    for (const value of [null, "both", 1, true, ""]) {
      const lib = allFlagged(value);
      for (const h of histories) {
        for (const budgetMin of [15, 30, 60, 120]) {
          for (const energy of ["low", "normal", "high"] as const) {
            const si = input({ budgetMin, energy });
            const a = suggest(h, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
            const b = suggest(h, F_TARGETS, F_PROFILE, lib, si, NOW, TZ);
            expect(b, `${String(value)} ${budgetMin} ${energy}`).toEqual(a);
          }
        }
      }
      const w = run(LIBRARY, { pinnedIds: ["db-row"], ...PICK });
      const swapA = applySwap(w, "db-row", "lat-pulldown", null, [], F_PROFILE, LIBRARY, NOW, TZ);
      const swapB = applySwap(w, "db-row", "lat-pulldown", null, [], F_PROFILE, lib, NOW, TZ);
      expect(swapB).toEqual(swapA);
      const base = run(LIBRARY, { pinnedIds: ["lat-pulldown"], ...PICK });
      const ins = (l: readonly LibraryExercise[]) =>
        insertItem(base, "db-row", { atIndex: 1, leftS: 900 }, [], F_PROFILE, l, NOW, TZ);
      expect(ins(lib)).toEqual(ins(LIBRARY));
    }
    for (const e of L1_ONE) expect(oneSide(e)).toBe(e.id === "db-row" || e.id === "plank");
  });

  it("rule-7.1 (AC7) counting is untouched, and a tombstoned flagged set does not count", () => {
    const hist: HistorySet[] = [
      ...balancedHistory,
      ...setsOn(3, "db-row", "2026-09-20", { tag: "a" }),
      ...setsOn(1, "db-row", "2026-09-21", { tag: "b", deletedAt: "2026-09-21T12:00:00+02:00" }),
    ];
    const noRow = balancedHistory;
    const bal = (lib: readonly LibraryExercise[]) => balance(hist, F_TARGETS, lib, NOW, TZ);
    expect(bal(L1_ONE)).toEqual(bal(LIBRARY));
    expect(records(hist, L1_ONE)).toEqual(records(hist, LIBRARY));
    expect(estimatedOneRepMax(hist, L1_ONE, "db-row")).toEqual(
      estimatedOneRepMax(hist, LIBRARY, "db-row"),
    );
    const slot = { repsMin: 8, repsMax: 12 };
    expect(prefill(byId(L1_ONE, "db-row"), slot, hist, L1_ONE, NOW, TZ, null)).toEqual(
      prefill(byId(LIBRARY, "db-row"), slot, hist, LIBRARY, NOW, TZ, null),
    );
    // Each live flagged set is one hard set (3), the tombstoned one is not (still 3, not 4).
    const back = (h: readonly HistorySet[]) =>
      balance(h, F_TARGETS, L1_ONE, NOW, TZ).areas.find((a) => a.area === "back");
    expect((back(hist)?.load ?? 0) - (back(noRow)?.load ?? 0)).toBe(3);
  });

  it("rule-7.1 (AC9) the real library: the 17 flagged rows are priced doubled, the rest are not", () => {
    const dir = path.join(REPO_DIR, "data", "exercises", "library");
    const rows = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const j = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, unknown>;
        const ex = {
          id: j.id as string,
          name: j.name as string,
          kind: j.kind,
          type: j.type,
          level: j.level,
          equipment: j.equipment,
          areas: j.areas,
          timed: (j.timed as boolean | undefined) ?? false,
          defaultDurationS: (j.default_duration_s as number | undefined) ?? null,
          incrementKg: (j.increment_kg as number | undefined) ?? null,
          externalLoad: j.bodyweight !== true,
        } as LibraryExercise;
        return flagged(ex, j.unilateral ?? null);
      });
    expect(rows).toHaveLength(109);
    const flaggedRows = rows.filter(oneSide);
    expect(flaggedRows).toHaveLength(17);
    for (const e of rows) {
      const side = e.timed ? (e.defaultDurationS ?? 45) : 45;
      const rest = e.type === "compound" ? 120 : 60;
      expect(setCostS(e), e.id).toBe((oneSide(e) ? 2 * side : side) + rest);
    }
  });

  it("rule-7.1 (AC10) the vendored cost model carries the flag logic", () => {
    const vendored = readFileSync(
      path.join(REPO_DIR, "supabase", "functions", "_shared", "vendor", "engine", "cost.js"),
      "utf8",
    );
    expect(vendored).toContain("unilateral");
    expect(vendored).toContain("isOneSide");
  });

  it("rule-7.1 (AC12) engine-rules.md carries the sentence, R7-E43…E45 and the traceability row", () => {
    const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");
    expect(doc).toContain("One side at a time (D-0268)");
    for (const id of ["R7-E43", "R7-E44", "R7-E45"]) expect(doc).toContain(`**${id} `);
    expect(doc).toMatch(/\| 7\.1 one side at a time[^\n]*T-0978b \|/);
  });
});
