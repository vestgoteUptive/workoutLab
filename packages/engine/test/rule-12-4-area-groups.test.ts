// T-0994 UF-08.2 UF-08.4: rule 12.4 `areaGroups` (D-0275 §2). AC7.
import { describe, expect, it } from "vitest";
import { areaGroups, orderItems, removeItem, suggest } from "@workoutlab/engine";
import {
  F_INPUT,
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  deepFreeze,
  input,
} from "./fixtures/common.js";
import { fixtureW, mkItem, mkWorkout } from "./fixtures/order-groups.js";

describe("rule-12-4 areaGroups", () => {
  it("rule-12-4 R12-E27 W: chest 4, back 3, quads 2 in order of first appearance", () => {
    expect(areaGroups(deepFreeze(fixtureW()))).toStrictEqual([
      { area: "chest", itemIds: ["bench-press"], sets: 4, costS: 720 },
      { area: "back", itemIds: ["inverted-row"], sets: 3, costS: 555 },
      { area: "quads", itemIds: ["leg-extension"], sets: 2, costS: 270 },
    ]);
  });

  it("rule-12-4 R12-E28 a back-off set is not counted", () => {
    const w = suggest(
      [],
      F_TARGETS,
      F_PROFILE,
      LIBRARY,
      input({ budgetMin: 15, energy: "high", warmupInBudget: false }),
      NOW,
      TZ,
    );
    expect(w.plan.items[0]?.backoff).not.toBeNull();
    expect(areaGroups(w)).toStrictEqual([
      { area: "chest", itemIds: ["bench-press"], sets: 4, costS: 885 },
    ]);
  });

  it("rule-12-4 R12-E29 an empty plan gives []", () => {
    const w = removeItem(
      suggest([], F_TARGETS, F_PROFILE, LIBRARY, input({ budgetMin: 15 }), NOW, TZ),
      "bench-press",
    );
    expect(w.plan.items).toEqual([]);
    expect(areaGroups(w)).toStrictEqual([]);
    expect(F_INPUT.budgetMin).toBeGreaterThan(0);
  });

  it("rule-12-4 R12-E30 two items in one area are one group with summed sets", () => {
    const w = mkWorkout(
      [
        mkItem("bench-press", 4, true),
        mkItem("barbell-row", 3),
        mkItem("inverted-row", 2),
        mkItem("leg-extension", 2),
      ],
      "bench-press",
    );
    const expected = [
      { area: "chest", itemIds: ["bench-press"], sets: 4, costS: 720 },
      { area: "back", itemIds: ["barbell-row", "inverted-row"], sets: 5, costS: 945 },
      { area: "quads", itemIds: ["leg-extension"], sets: 2, costS: 270 },
    ];
    expect(areaGroups(w)).toStrictEqual(expected);
    // Order of first appearance holds after rule 7.6 reorders the plan.
    expect(areaGroups(orderItems(w, LIBRARY)).map((g) => g.area)).toEqual([
      "chest",
      "back",
      "quads",
    ]);
    const sums = areaGroups(w);
    expect(sums.reduce((s, g) => s + g.sets, 0)).toBe(w.plan.items.reduce((s, i) => s + i.sets, 0));
    expect(sums.reduce((s, g) => s + g.costS, 0)).toBe(w.itemsTotalS);
  });
});
