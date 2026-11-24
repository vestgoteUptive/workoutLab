// T-0996 AC12 and the T-0995 review note (D-0287 §3): the seam to the engine's area edits. Every
// call carries `targets` in its context, an edit returns the engine's own plan or refusal, and a
// fill never brings back an area it was told to skip. Pure: no router, no DOM.
import { describe, expect, it } from "vitest";
import { areaGroups, suggest, type Workout } from "@workoutlab/engine";
import {
  adjustSets,
  editContext,
  fillRest,
  itemsOfArea,
  overviewOf,
  pruneRestore,
  putIn,
  restorableOf,
  takeOut,
} from "../area-plan-engine.js";
import type { SetupData } from "../use-setup-data.js";
import { NOW, TZ, fLibrary, fProfile, fTargets } from "./fixtures.js";

const data: SetupData = {
  history: [],
  targets: fTargets(),
  profile: fProfile(),
  library: fLibrary(),
} as unknown as SetupData;

const ctx = editContext(data, {
  excludeIds: [],
  favoriteIds: [],
  avoidAreas: [],
  nowIso: NOW,
  tz: TZ,
});

function plan(budgetMin: number, empty = false): Workout {
  return suggest(
    data.history,
    data.targets,
    data.profile,
    data.library,
    {
      budgetMin,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
      ...(empty ? { autoMainLift: false, fill: false } : {}),
    },
    NOW,
    TZ,
  );
}

describe("T-0996 AC12 area-plan-engine", () => {
  it("D-0287 §3: the context carries the nine targets and the visit's lists", () => {
    expect(ctx.targets).toHaveLength(9);
    const withLists = editContext(data, {
      excludeIds: ["bench-press"],
      favoriteIds: ["db-row"],
      avoidAreas: ["calves"],
      nowIso: NOW,
      tz: TZ,
    });
    expect(withLists.excludeIds).toEqual(["bench-press"]);
    expect(withLists.favoriteIds).toEqual(["db-row"]);
    expect(withLists.avoidAreas).toEqual(["calves"]);
    expect(ctx).not.toHaveProperty("avoidAreas");
  });

  it("an edit returns the engine's plan, or its refusal reason", () => {
    const w = plan(45);
    const refused = adjustSets(w, "hamstrings", 1, ctx);
    expect(refused).toEqual({ refused: "time" });
    const less = adjustSets(w, "calves", -1, ctx);
    expect(
      "workout" in less && areaGroups(less.workout).find((g) => g.area === "calves")?.sets,
    ).toBe(2);
    expect(adjustSets(w, "arms", 1, ctx)).toEqual({ refused: "unavailable" });
    expect(putIn(w, "chest", ctx)).toEqual({ refused: "unavailable" });
    expect(takeOut(w, "arms")).toEqual({ refused: "unavailable" });
  });

  it("the overview lists the refused + and the addable areas from the engine", () => {
    const w = plan(45);
    const o = overviewOf(w, ctx);
    expect(Object.keys(o.stepRefusals).sort()).toEqual(
      areaGroups(w)
        .map((g) => g.area)
        .sort(),
    );
    expect(o.candidates.map((c) => c.area).sort()).toEqual(
      ["arms", "core", "quads", "shoulders"].sort(),
    );
  });

  it("fillRest adds until nothing fits and never an area it was told to skip", () => {
    const empty = plan(45, true);
    expect(areaGroups(empty)).toEqual([]);
    const all = fillRest(empty, ctx, []);
    expect(all.added.length).toBeGreaterThan(1);
    expect(areaGroups(all.workout).map((g) => g.area)).toEqual(all.added);
    const skipping = fillRest(empty, ctx, ["chest"]);
    expect(skipping.added).not.toContain("chest");
    expect(skipping.added.length).toBeGreaterThan(0);
    // A second fill finds nothing left to add.
    expect(fillRest(all.workout, ctx, []).added).toEqual([]);
  });
});

describe("T-1023 restore memory in the seam", () => {
  const full = plan(90);
  const gone = itemsOfArea(full, "hamstrings");
  const without = takeOut(full, "hamstrings") as { workout: Workout };
  const withMemory = (excludeIds: string[]) => ({
    ...editContext(data, {
      excludeIds,
      favoriteIds: [],
      avoidAreas: [],
      restore: gone,
      nowIso: NOW,
      tz: TZ,
    }),
  });

  it("T-1023 AC2 restorableOf names a removed area the engine would restore, and not one it would fall back for", () => {
    expect(gone.length).toBeGreaterThan(0);
    expect(restorableOf(without.workout, withMemory([]))).toEqual(["hamstrings"]);
    // An item of the area is now out for the visit: the engine falls back, Fill can't add it.
    expect(restorableOf(without.workout, withMemory([gone[0]!.exerciseId]))).toEqual([]);
  });

  it("T-1023 AC6 fillRest skips a removed area whose memory cannot be restored", () => {
    const ctxOut = withMemory([gone[0]!.exerciseId]);
    const result = fillRest(without.workout, ctxOut, ["hamstrings"]);
    expect(result.added).not.toContain("hamstrings");
    expect(result.restored).not.toContain("hamstrings");
  });

  it("T-1023 pruneRestore drops items of areas now in the plan, of the listed areas, and items with no home area", () => {
    const noHome = { ...gone[0]!, reasons: [] };
    expect(pruneRestore([...gone, noHome], without.workout)).toEqual(gone);
    expect(pruneRestore(gone, full)).toEqual([]);
    expect(pruneRestore(gone, without.workout, ["hamstrings"])).toEqual([]);
  });
});
