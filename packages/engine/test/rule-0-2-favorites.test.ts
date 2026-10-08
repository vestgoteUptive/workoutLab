// T-0562 UF-08.2 UF-02.1 UF-11.6 (D-0202 §1 §3): rule 0.2 favorite exercises, part 1. The
// optional `sessionInput.favoriteIds`, rule 7.2 ranking key (0) "in favoriteIds first",
// R7-E21…E27, the unchanged rankSwaps and reason codes, and traceability. The simulated
// histories with favorites (R7-E28…E30) and the fast-check properties are T-0563.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  rankCandidates,
  rankSwaps,
  suggest,
  type HistorySet,
  type Reason,
  type SessionInput,
  type SwapReason,
  type Workout,
} from "@workoutlab/engine";
import {
  F_PROFILE,
  F_TARGETS,
  HOUR,
  LIBRARY,
  NOW,
  TZ,
  input,
  itemsOf,
  setsAt,
  setsOn,
  shift,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

function run(overrides: Partial<SessionInput> = {}, history: readonly HistorySet[] = []): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, input(overrides), NOW, TZ);
}

/** R7-E3: 6 hard back-squat sets at now − 24 h, so glutes and quads are recovering. */
const RECOVERING_SQUATS = setsAt(6, "back-squat", shift(NOW, -24 * HOUR));
/** R7-E7: the most recent session contains inverted-row × 3. */
const R7_E7_HISTORY = setsOn(3, "inverted-row", "2026-09-25");
const LEGS_ONLY = ["chest", "back", "shoulders", "arms", "core"] as const;

const R7_E4 = run();
const R7_E3 = run({}, RECOVERING_SQUATS);

describe("rule 7.2 key (0): favorites first (R7-E21…E27, D-0202 §3)", () => {
  it("R7-E21 rule-0.2 (AC1) a favorite that doesn't fit is passed over: deep-equal to R7-E4", () => {
    expect(itemsOf(R7_E4)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(run({ favoriteIds: ["back-squat"] })).toEqual(R7_E4);
  });

  it("R7-E22 rule-0.2 (AC2) a favorite compound becomes the main lift: db-bench-press × 4", () => {
    const w = run({ favoriteIds: ["db-bench-press"] });
    expect(itemsOf(w)).toEqual([
      ["db-bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("db-bench-press");
    expect(w.plan.items[0]?.isMain).toBe(true);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
  });

  it("R7-E23 rule-0.2 (AC3) a favorite changes later areas: barbell-row × 3, then dead-bug × 2", () => {
    const w = run({ favoriteIds: ["barbell-row"] });
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["dead-bug", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
  });

  it("R7-E24 rule-0.2 (AC4) a favorite beats 'not in the last session' in the back ranking", () => {
    const rank = (favoriteIds?: readonly string[]) =>
      rankCandidates(
        "back",
        R7_E7_HISTORY,
        F_TARGETS,
        F_PROFILE,
        LIBRARY,
        input(favoriteIds === undefined ? {} : { favoriteIds }),
        NOW,
        TZ,
      );
    expect(rank(["inverted-row"])).toEqual([
      "inverted-row",
      "barbell-row",
      "db-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
    ]);
    // Stable partition: without the favorite, R7-E7's order is unchanged.
    expect(rank()).toEqual([
      "barbell-row",
      "db-row",
      "lat-pulldown",
      "seated-cable-row",
      "straight-arm-pulldown",
      "inverted-row",
    ]);
  });

  it("R7-E25 rule-0.2 (AC5) recovery wins: a recovering favorite is not picked, deep-equal to R7-E3", () => {
    const w = run({ favoriteIds: ["back-squat"] }, RECOVERING_SQUATS);
    expect(w).toEqual(R7_E3);
    expect(w.plan.items.map((i) => i.exerciseId)).not.toContain("back-squat");
  });

  it("rule-0.2 (AC5) a favorite with one recovering primary area isn't a candidate in its other one", () => {
    // 6 hard hip-thrust sets at now − 24 h: glutes is recovering, quads isn't. back-squat has
    // weight 1.0 in both, so it stays out of the quads candidates even as a favorite.
    const h = setsAt(6, "hip-thrust", shift(NOW, -24 * HOUR));
    const without = run({ avoidAreas: LEGS_ONLY }, h);
    expect(itemsOf(without)).toEqual([
      ["romanian-deadlift", 4],
      ["leg-extension", 3],
      ["calf-raise", 3],
    ]);
    expect(run({ avoidAreas: LEGS_ONLY, favoriteIds: ["back-squat"] }, h)).toEqual(without);
  });

  it("R7-E26 rule-0.2 (AC6) an explicit mainLiftId and an exclusion beat a favorite", () => {
    expect(run({ favoriteIds: ["db-bench-press"], mainLiftId: "bench-press" })).toEqual(R7_E4);
    expect(run({ favoriteIds: ["db-bench-press"], excludeIds: ["db-bench-press"] })).toEqual(R7_E4);
  });

  it("R7-E27 rule-0.2 (AC7) a favorite picks the main lift inside the area the gaps chose", () => {
    const w = run({ avoidAreas: LEGS_ONLY, favoriteIds: ["hip-thrust"] });
    expect(itemsOf(w)).toEqual([
      ["hip-thrust", 4],
      ["back-squat", 3],
      ["calf-raise", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("hip-thrust");
    expect(w.itemsTotalS).toBe(1545);
    expect(w.unusedS).toBe(75);
    expect(run({ avoidAreas: LEGS_ONLY, favoriteIds: [] }).plan.mainLiftId).toBe("back-squat");
  });
});

describe("rule 0.2 defaults and the unchanged rest (D-0202 §3)", () => {
  it("rule-0.2 (AC8) absent favoriteIds deep-equals [] on R7-E4 and every simulated history", () => {
    expect(run({ favoriteIds: [] })).toEqual(R7_E4);
    const histories: HistorySet[][] = [[], ...Object.values(SIMULATED_HISTORIES)];
    for (const h of histories) {
      for (const budgetMin of [15, 30, 45, 60, 90, 120]) {
        expect(run({ budgetMin, favoriteIds: [] }, h)).toEqual(run({ budgetMin }, h));
      }
    }
  });

  it("rule-0.2 (AC9) rankSwaps is unchanged and reasons stay in the rule 10 set", () => {
    // rankSwaps has no favorites parameter (9 declared, the last defaulted).
    expect(rankSwaps.length).toBeLessThanOrEqual(9);
    const reasons: Array<SwapReason | null> = [
      null,
      "equipment_taken",
      "discomfort",
      "variety",
      "short_on_time",
    ];
    const cases: Array<[Partial<SessionInput>, readonly string[], HistorySet[]]> = [
      [{}, ["back-squat"], []],
      [{}, ["db-bench-press"], []],
      [{}, ["barbell-row"], []],
      [{}, ["inverted-row"], R7_E7_HISTORY],
      [{}, ["back-squat"], RECOVERING_SQUATS],
      [{ mainLiftId: "bench-press" }, ["db-bench-press"], []],
      [{ excludeIds: ["db-bench-press"] }, ["db-bench-press"], []],
      [{ avoidAreas: LEGS_ONLY }, ["hip-thrust"], []],
    ];
    const ruleTenCodes = new Set<Reason["code"]>([
      "main_lift",
      "area_deficit",
      "days_since",
      "recovering_skipped",
      "energy_low_trim",
      "energy_high_backoff",
      "swap",
      "prefill",
    ]);
    for (const [base, favoriteIds, h] of cases) {
      const withFav = run({ ...base, favoriteIds }, h);
      const without = run(base, h);
      const ex = base.excludeIds ?? [];
      for (const item of withFav.plan.items) {
        for (const r of reasons) {
          const a = rankSwaps(item.exerciseId, r, withFav, F_PROFILE, LIBRARY, h, NOW, TZ, ex);
          // Same session, same other inputs: favorites can't reach rankSwaps.
          expect(a).toEqual(
            rankSwaps(
              item.exerciseId,
              r,
              structuredClone(withFav),
              F_PROFILE,
              LIBRARY,
              h,
              NOW,
              TZ,
              ex,
            ),
          );
          if (JSON.stringify(withFav) === JSON.stringify(without)) {
            expect(a).toEqual(
              rankSwaps(item.exerciseId, r, without, F_PROFILE, LIBRARY, h, NOW, TZ, ex),
            );
          }
        }
        for (const reason of item.reasons) expect(ruleTenCodes.has(reason.code)).toBe(true);
      }
      for (const reason of withFav.sessionReasons) expect(ruleTenCodes.has(reason.code)).toBe(true);
    }
  });

  it("rule-0.2 duplicates, order and unknown ids in favoriteIds have no effect", () => {
    const base = run({ favoriteIds: ["barbell-row"] });
    expect(run({ favoriteIds: ["no-such-id", "barbell-row", "barbell-row"] })).toEqual(base);
    expect(run({ favoriteIds: ["no-such-id"] })).toEqual(R7_E4);
    const two = run({ favoriteIds: ["barbell-row", "db-bench-press"] });
    expect(run({ favoriteIds: ["db-bench-press", "barbell-row"] })).toEqual(two);
  });
});

describe("T-0562 traceability (AC11)", () => {
  const ids = ["R7-E21", "R7-E22", "R7-E23", "R7-E24", "R7-E25", "R7-E26", "R7-E27"];

  it("rule-0.2 (AC11) rule 0 lists favoriteIds, rule 0.2 exists, rule 7.2 has key (0) and the examples", () => {
    const r0 = doc.slice(doc.indexOf("## 0. "), doc.indexOf("## 1. "));
    const sessionLine = r0.split("\n").find((l) => l.startsWith("- **Session input**"));
    expect(sessionLine).toContain(
      "the optional `favoriteIds` (rule 0.2, D-0202 §3; absent means `[]`)",
    );
    const r02 = r0.slice(r0.indexOf("### 0.2 Favorite exercises"));
    expect(r02).toContain(
      "**Precedence:** `excludeIds` > `mainLiftId` > `pinnedIds` > `favoriteIds` > the existing ranking.",
    );
    const r72 = doc.slice(doc.indexOf("### 7.2 "), doc.indexOf("### 7.3 "));
    expect(r72).toContain(
      "Candidates are ranked by: (0) in `favoriteIds` first (rule 0.2, D-0202 §3); (1) not in the most recent session",
    );
    expect(r72).toContain("the stable partition of the list without favorites");
    for (const id of ids) {
      expect(r72.split("\n").filter((l) => l.startsWith(`- **${id} `))).toHaveLength(1);
    }
    const table = doc.slice(doc.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0562\s*\|$/.test(l))).toEqual([
      "| 0.2 favoriteIds, 7.2 ranking key (0) (R7-E21…E27, D-0202 §3) | T-0562 |",
    ]);
  });

  it("rule-0.2 (AC11) every new example id is named in a test title", () => {
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const titles: string[] = [];
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
      const text = readFileSync(path.join(TEST_DIR, f), "utf8");
      for (const m of text.matchAll(titleRe)) titles.push(m[2] ?? "");
    }
    const missing = ids.filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });
});
