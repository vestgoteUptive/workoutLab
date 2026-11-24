// T-0994 UF-08.2 UF-08.4: rule 7.6 `orderItems` (D-0275 §7). AC1–AC6, AC9, AC11.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { equipmentGroupOf, orderItems, removeItem, type Workout } from "@workoutlab/engine";
import { LIBRARY, deepFreeze } from "./fixtures/common.js";
import { exerciseOf, fixtureW, ids, mkItem, mkWorkout } from "./fixtures/order-groups.js";
import { mulberry32 } from "./fixtures/random.js";

const order = (w: Workout) => orderItems(w, LIBRARY);
const plain = (...list: Array<[string, number]>) => mkWorkout(list.map(([id, n]) => mkItem(id, n)));

describe("rule-7-6 orderItems examples", () => {
  it("rule-7-6 R7-E46 W is already in order", () => {
    const w = fixtureW();
    expect(order(w)).toStrictEqual(w);
  });

  it("rule-7-6 R7-E47 (AC2) both compounds precede both isolations", () => {
    const w = plain(
      ["leg-extension", 2],
      ["lat-pulldown", 3],
      ["biceps-curl", 2],
      ["back-squat", 3],
    );
    expect(ids(order(w))).toEqual(["lat-pulldown", "back-squat", "leg-extension", "biceps-curl"]);
  });

  it("rule-7-6 R7-E48 (AC3) areas alternate; one area keeps the original order", () => {
    const three = plain(["db-bench-press", 3], ["push-up", 3], ["barbell-row", 3]);
    expect(ids(order(three))).toEqual(["db-bench-press", "barbell-row", "push-up"]);
    const withMain = mkWorkout(
      [
        mkItem("bench-press", 4, true),
        mkItem("db-bench-press", 3),
        mkItem("push-up", 3),
        mkItem("barbell-row", 3),
      ],
      "bench-press",
    );
    expect(ids(order(withMain))).toEqual([
      "bench-press",
      "barbell-row",
      "db-bench-press",
      "push-up",
    ]);
    const one = plain(["db-bench-press", 3], ["push-up", 3], ["bench-press", 3]);
    expect(ids(order(one))).toEqual(["db-bench-press", "push-up", "bench-press"]);
  });

  it("rule-7-6 R7-E49 (AC4) machines grouped; no shared group keeps the original order", () => {
    const m = plain(["leg-extension", 2], ["biceps-curl", 2], ["leg-curl", 2]);
    expect(ids(order(m))).toEqual(["leg-extension", "leg-curl", "biceps-curl"]);
    const none = plain(["lateral-raise", 2], ["plank", 2], ["leg-extension", 2]);
    expect(ids(order(none))).toEqual(["lateral-raise", "plank", "leg-extension"]);
  });

  it("rule-7-6 R7-E50 (AC5) equipment groups", () => {
    const g = (id: string) => equipmentGroupOf(exerciseOf(id));
    expect(
      [
        "bench-press",
        "back-squat",
        "db-row",
        "leg-extension",
        "lat-pulldown",
        "pull-up",
        "push-up",
      ].map(g),
    ).toEqual(["barbell", "barbell", "dumbbell", "machine", "cable", "bodyweight", "bodyweight"]);
    const base = exerciseOf("push-up");
    expect(equipmentGroupOf({ ...base, equipment: ["rack", "barbell"] })).toBe("barbell");
    expect(equipmentGroupOf({ ...base, equipment: ["none"] })).toBe("bodyweight");
    expect(equipmentGroupOf({ ...base, equipment: ["kettlebell"] })).toBe("bodyweight");
  });

  it("rule-7-6 R7-E51 (AC1) no main lift: tier 0 is empty and the compound leads", () => {
    const w = removeItem(fixtureW(), "bench-press");
    const o = order(w);
    expect(ids(o)).toEqual(["inverted-row", "leg-extension"]);
    expect(o.plan.mainLiftId).toBeNull();
    const mixed = plain(["leg-curl", 2], ["barbell-row", 3]);
    expect(ids(order(mixed))[0]).toBe("barbell-row");
  });

  it("rule-7-6 (AC1) the main lift is first even when listed last", () => {
    const w = mkWorkout(
      [mkItem("leg-extension", 2), mkItem("barbell-row", 3), mkItem("bench-press", 4, true)],
      "bench-press",
    );
    expect(ids(order(w))).toEqual(["bench-press", "barbell-row", "leg-extension"]);
  });

  it("rule-7-6 throws RangeError for an item missing from the library", () => {
    expect(() => orderItems(fixtureW(), [])).toThrow(RangeError);
  });
});

describe("rule-7-6 (AC6) permutation", () => {
  it("rule-7-6 keeps costs, totals, warm-up, reasons and main lift; idempotent; no mutation", () => {
    const w = deepFreeze(
      mkWorkout(
        [
          mkItem("leg-extension", 2),
          mkItem("lat-pulldown", 3),
          mkItem("bench-press", 4, true),
          mkItem("leg-curl", 2),
        ],
        "bench-press",
      ),
    );
    const o = order(w);
    expect(o).not.toBe(w);
    const key = (i: { exerciseId: string }) => i.exerciseId;
    expect(o.plan.items.map(key).sort()).toEqual(w.plan.items.map(key).sort());
    for (const it of o.plan.items) {
      expect(it).toStrictEqual(w.plan.items.find((x) => x.exerciseId === it.exerciseId));
    }
    expect([o.itemsTotalS, o.totalS, o.unusedS]).toEqual([w.itemsTotalS, w.totalS, w.unusedS]);
    expect(o.plan.mainLiftId).toBe("bench-press");
    expect(o.plan.warmup).toStrictEqual(w.plan.warmup);
    expect(o.plan.startDeficits).toStrictEqual(w.plan.startDeficits);
    expect(o.sessionReasons).toStrictEqual(w.sessionReasons);
    expect([o.budgetMin, o.warmupInBudget, o.energy]).toEqual([
      w.budgetMin,
      w.warmupInBudget,
      w.energy,
    ]);
    expect(order(o)).toStrictEqual(o);
  });
});

const POOL = LIBRARY.filter((e) => e.kind === "exercise").map((e) => e.id);

function randomPlan(rand: () => number): Workout {
  const n = 1 + Math.floor(rand() * 8);
  const pool = [...POOL];
  const items = [];
  for (let k = 0; k < n; k++) {
    const id = pool.splice(Math.floor(rand() * pool.length), 1)[0] as string;
    items.push(mkItem(id, 1 + Math.floor(rand() * 4)));
  }
  const compounds = items.filter((i) => exerciseOf(i.exerciseId).type === "compound");
  const main =
    compounds.length > 0 && rand() < 0.7
      ? compounds[Math.floor(rand() * compounds.length)]
      : undefined;
  if (main !== undefined) main.isMain = true;
  return mkWorkout(items, main?.exerciseId ?? null);
}

describe("rule-7-6 (AC9) seeded properties", () => {
  it("rule-7-6 200 seeded plans: deterministic, permutation, idempotent, main lift first, tiers", () => {
    for (let seed = 0; seed < 200; seed++) {
      const w = randomPlan(mulberry32(70_000 + seed));
      const a = order(w);
      expect(a, `seed ${seed}`).toStrictEqual(order(w));
      expect(a.plan.items.map((i) => i.exerciseId).sort(), `seed ${seed}`).toEqual(
        w.plan.items.map((i) => i.exerciseId).sort(),
      );
      expect(order(a), `seed ${seed}`).toStrictEqual(a);
      if (w.plan.mainLiftId !== null) expect(a.plan.items[0]?.exerciseId).toBe(w.plan.mainLiftId);
      const tiers = a.plan.items.map((i) =>
        i.isMain ? 0 : exerciseOf(i.exerciseId).type === "compound" ? 1 : 2,
      );
      expect(tiers, `seed ${seed}`).toEqual([...tiers].sort());
    }
  }, 30_000);
});

describe("rule-7-6 (AC11) purity", () => {
  it("rule-7-6 the new sources have no clock or entropy", () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    for (const f of ["order.ts", "area-groups.ts"]) {
      const code = readFileSync(path.join(dir, f), "utf8").replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
    }
  });
});
