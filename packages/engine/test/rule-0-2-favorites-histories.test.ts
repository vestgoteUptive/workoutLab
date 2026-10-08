// T-0563 UF-08.2 (D-0202 §3, D-0036 §5): rule 0.2 favorite exercises, part 2. The simulated
// 14-day histories with favoriteIds [back-squat] (R7-E28…E30), the seeded properties P1–P5,
// the "Shuffle may rotate an accessory favorite away" property (D-0202, spec open question 2)
// and traceability. fast-check isn't in the lockfile (D-0036 §5), so a seeded mulberry32 PRNG
// drives every property, and a failure reports its seed.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AREAS,
  availableS,
  primaryAreas,
  rankCandidates,
  suggest,
  type Area,
  type Energy,
  type HistorySet,
  type LibraryExercise,
  type SessionInput,
  type Workout,
} from "@workoutlab/engine";
import { F_PROFILE, F_TARGETS, L1, LIBRARY, NOW, TZ, input, itemsOf } from "./fixtures/common.js";
import {
  SIMULATED_HISTORIES,
  allChestNoLegsHistory,
  balancedHistory,
  returningAfter10DaysHistory,
} from "./fixtures/histories.js";
import { mulberry32, randomHistory } from "./fixtures/random.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(TEST_DIR, "..", "..", "..");
const doc = readFileSync(path.join(REPO_DIR, "docs", "engine-rules.md"), "utf8");

function run(history: readonly HistorySet[], si: SessionInput): Workout {
  return suggest(history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
}

const FAV = ["back-squat"] as const;
const L1_IDS = L1.map((e) => e.id);
const LIB = new Map(LIBRARY.map((e) => [e.id, e]));
const ENERGIES: readonly Energy[] = ["low", "normal", "high"];
/** Fixed seed base for every property (AC2): case `i` uses seed `SEED + i`. */
const SEED = 563_000;
const N = 250;
/** T-0230: seeded property tests get a ≥ 30 s runtime budget. */
const BUDGET_MS = 30_000;

function rankOf(
  area: Area,
  history: readonly HistorySet[],
  si: Pick<SessionInput, "excludeIds" | "avoidAreas" | "favoriteIds">,
): string[] {
  return rankCandidates(area, history, F_TARGETS, F_PROFILE, LIBRARY, si, NOW, TZ);
}

// ---- R7-E28…E30: the simulated histories with favoriteIds [back-squat] ----

describe("rule 0.2 simulated 14-day histories (R7-E28…E30, D-0202 §3)", () => {
  it("R7-E28 rule-0.2 (AC1) balanced + [back-squat]: db-bench-press × 4, db-row × 3, leg-extension × 2", () => {
    const w = run(balancedHistory, input({ favoriteIds: FAV }));
    expect(itemsOf(w)).toEqual([
      ["db-bench-press", 4],
      ["db-row", 3],
      ["leg-extension", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("db-bench-press");
    expect(w.plan.items.map((i) => i.costS)).toEqual([720, 555, 270]);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.totalS).toBe(1725);
    expect(w.unusedS).toBe(75);
    // The favorite leads the quads ranking (without it, "in the last session" puts it last),
    // but back-squat × 2 (390 s) doesn't fit the 345 s left, so time wins (R7-E21).
    expect(rankOf("quads", balancedHistory, input({ favoriteIds: FAV }))).toEqual([
      "back-squat",
      "leg-extension",
    ]);
    expect(rankOf("quads", balancedHistory, input())).toEqual(["leg-extension", "back-squat"]);
    expect(run(balancedHistory, input())).toEqual(w);
  });

  it("R7-E29 rule-0.2 (AC1) all-chest-no-legs + [back-squat]: inverted-row × 4, back-squat × 3, calf-raise × 2", () => {
    const w = run(allChestNoLegsHistory, input({ favoriteIds: FAV }));
    expect(itemsOf(w)).toEqual([
      ["inverted-row", 4],
      ["back-squat", 3],
      ["calf-raise", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("inverted-row");
    expect(w.plan.items.map((i) => i.costS)).toEqual([720, 555, 270]);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.totalS).toBe(1725);
    expect(w.unusedS).toBe(75);
    expect(w.plan.items.map((i) => i.exerciseId)).toContain("back-squat");
    expect(rankOf("glutes", allChestNoLegsHistory, input({ favoriteIds: FAV }))).toEqual([
      "back-squat",
      "hip-thrust",
    ]);
    expect(run(allChestNoLegsHistory, input())).toEqual(w);
  });

  it("R7-E30 rule-0.2 (AC1) returning after 10 days + [back-squat]: bench-press × 4, inverted-row × 3, calf-raise × 2", () => {
    const w = run(returningAfter10DaysHistory, input({ favoriteIds: FAV }));
    expect(itemsOf(w)).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["calf-raise", 2],
    ]);
    expect(w.plan.mainLiftId).toBe("bench-press");
    expect(w.plan.items.map((i) => i.costS)).toEqual([720, 555, 270]);
    expect(w.itemsTotalS).toBe(1545);
    expect(w.totalS).toBe(1725);
    expect(w.unusedS).toBe(75);
    expect(w.plan.items.map((i) => i.exerciseId)).not.toContain("back-squat");
    expect(run(returningAfter10DaysHistory, input())).toEqual(w);
  });
});

// ---- Seeded properties P1–P5 ----

const NAMED_HISTORIES: HistorySet[][] = [[], ...Object.values(SIMULATED_HISTORIES)];

interface Case {
  history: HistorySet[];
  si: SessionInput;
  label: string;
}

function subset<T>(rand: () => number, xs: readonly T[], p: number): T[] {
  return xs.filter(() => rand() < p);
}

function shuffled<T>(rand: () => number, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Budgets 15..120, every energy, warm-up on/off, shuffle 0..6, a named or random history. */
function randomCase(seed: number): Case & { rand: () => number } {
  const rand = mulberry32(seed);
  const h = Math.floor(rand() * (NAMED_HISTORIES.length + 2));
  const history =
    h < NAMED_HISTORIES.length ? (NAMED_HISTORIES[h] as HistorySet[]) : randomHistory(rand);
  const si = input({
    budgetMin: 15 + Math.floor(rand() * 106),
    warmupInBudget: rand() < 0.5,
    energy: ENERGIES[Math.floor(rand() * 3)] as Energy,
    shuffle: Math.floor(rand() * 7),
    favoriteIds: subset(rand, L1_IDS, 0.2),
  });
  return { history, si, rand, label: `seed ${seed}` };
}

function capsHold(si: SessionInput, w: Workout, label: string): void {
  const sum = w.plan.items.reduce((s, i) => s + i.costS, 0);
  expect(sum, label).toBeLessThanOrEqual(Math.max(0, availableS(si.budgetMin, si.warmupInBudget)));
  expect(w.plan.items.length, label).toBeLessThanOrEqual(8);
  const perArea = new Map<Area, number>();
  for (const i of w.plan.items) {
    for (const a of primaryAreas(LIB.get(i.exerciseId) as LibraryExercise)) {
      perArea.set(a, (perArea.get(a) ?? 0) + 1);
    }
  }
  for (const [a, n] of perArea) expect(n, `${label} ${a}`).toBeLessThanOrEqual(2);
}

describe("rule 0.2 properties P1–P5 (seeded, D-0036 §5)", () => {
  it(
    "rule-0.2 P1 (AC2) favoriteIds [] deep-equals absent",
    () => {
      for (let i = 0; i < N; i++) {
        const { history, si, label } = randomCase(SEED + i);
        const absent: SessionInput = { ...si };
        delete absent.favoriteIds;
        expect("favoriteIds" in absent).toBe(false);
        expect(run(history, { ...si, favoriteIds: [] }), label).toEqual(run(history, absent));
      }
    },
    BUDGET_MS,
  );

  it(
    "rule-0.2 P2 (AC2) invariant under permutation, duplication and unknown ids",
    () => {
      for (let i = 0; i < N; i++) {
        const { history, si, rand, label } = randomCase(SEED + 1000 + i);
        const fav = si.favoriteIds ?? [];
        const base = run(history, si);
        const dup = [...fav, ...subset(rand, fav, 0.5)];
        const noisy = shuffled(rand, [...dup, "no-such-id", "wu-cat-cow", "not-in-library"]);
        expect(run(history, { ...si, favoriteIds: shuffled(rand, fav) }), label).toEqual(base);
        expect(run(history, { ...si, favoriteIds: noisy }), label).toEqual(base);
      }
    },
    BUDGET_MS,
  );

  it(
    "rule-0.2 P3 (AC2) R7-E8's caps hold for any subset of L1 ids as favoriteIds",
    () => {
      for (let i = 0; i < N; i++) {
        const { history, si, label } = randomCase(SEED + 2000 + i);
        capsHold(si, run(history, si), label);
      }
      // Time running out: budget 15 with every L1 id favorited, warm-up on and off.
      for (const warmupInBudget of [true, false]) {
        for (const history of NAMED_HISTORIES) {
          const si = input({ budgetMin: 15, warmupInBudget, favoriteIds: L1_IDS });
          capsHold(si, run(history, si), `budget 15 warm-up ${String(warmupInBudget)}`);
        }
      }
    },
    BUDGET_MS,
  );

  it(
    "rule-0.2 P4 (AC2) an id in favoriteIds and excludeIds is never an item; equal to the call without it",
    () => {
      let both = 0;
      for (let i = 0; i < N; i++) {
        const { history, si, rand, label } = randomCase(SEED + 3000 + i);
        const fav = si.favoriteIds ?? [];
        // Exclude at least one favorite (when there is one) plus a few other L1 ids.
        const forced = fav.length > 0 ? [fav[Math.floor(rand() * fav.length)] as string] : [];
        const excludeIds = [...new Set([...forced, ...subset(rand, L1_IDS, 0.1)])];
        const withBoth = { ...si, excludeIds };
        const w = run(history, withBoth);
        const ids = new Set(w.plan.items.map((x) => x.exerciseId));
        for (const id of excludeIds) expect(ids.has(id), `${label} ${id}`).toBe(false);
        const trimmed = fav.filter((id) => !excludeIds.includes(id));
        if (trimmed.length < fav.length) both++;
        expect(w, label).toEqual(run(history, { ...withBoth, favoriteIds: trimmed }));
      }
      expect(both).toBeGreaterThanOrEqual(N / 2);
    },
    BUDGET_MS,
  );

  it(
    "rule-0.2 P5 (AC2) an area's ranking with favorites is the stable partition of the ranking without",
    () => {
      let moved = 0;
      for (let i = 0; i < N; i++) {
        const { history, si, rand, label } = randomCase(SEED + 4000 + i);
        const area = AREAS[Math.floor(rand() * AREAS.length)] as Area;
        const fav = si.favoriteIds ?? [];
        const rest = {
          excludeIds: subset(rand, L1_IDS, 0.1),
          avoidAreas: subset(rand, AREAS, 0.15).filter((a) => a !== area),
        };
        const without = rankOf(area, history, rest);
        const want = [
          ...without.filter((id) => fav.includes(id)),
          ...without.filter((id) => !fav.includes(id)),
        ];
        const got = rankOf(area, history, { ...rest, favoriteIds: fav });
        expect(got, `${label} ${area}`).toEqual(want);
        if (JSON.stringify(got) !== JSON.stringify(without)) moved++;
      }
      // The property is not vacuous: favorites reorder a good share of the rankings.
      expect(moved).toBeGreaterThanOrEqual(N / 10);
    },
    BUDGET_MS,
  );
});

// ---- Shuffle may rotate an accessory favorite away (D-0202 §3, spec open question 2) ----

describe("rule 13 with favorites: Shuffle may rotate an accessory favorite away (D-0202)", () => {
  it("rule-13 rule-0.2 R7-E23 with shuffle 1 rotates the favorite barbell-row away; the main lift stays", () => {
    const s0 = run([], input({ favoriteIds: ["barbell-row"] }));
    expect(itemsOf(s0)).toEqual([
      ["bench-press", 4],
      ["barbell-row", 3],
      ["dead-bug", 2],
    ]);
    const s1 = run([], input({ favoriteIds: ["barbell-row"], shuffle: 1 }));
    expect(itemsOf(s1)).toEqual([
      ["bench-press", 4],
      ["db-row", 3],
      ["hanging-knee-raise", 2],
    ]);
  });

  it(
    "rule-13 rule-0.2 property: accessory favorites are shuffled like any slot; the main lift never is",
    () => {
      let favSlots = 0;
      let rotated = 0;
      for (let i = 0; i < N; i++) {
        const { history, si, label } = randomCase(SEED + 5000 + i);
        const s0 = run(history, { ...si, shuffle: 0 });
        const fav = new Set(si.favoriteIds ?? []);
        for (let n = 1; n <= 6; n++) {
          const sn = run(history, { ...si, shuffle: n });
          expect(sn.plan.mainLiftId, `${label} n ${n}`).toBe(s0.plan.mainLiftId);
          s0.plan.items.forEach((item, k) => {
            if (item.isMain || !fav.has(item.exerciseId)) return;
            favSlots++;
            if (sn.plan.items[k]?.exerciseId !== item.exerciseId) rotated++;
          });
        }
      }
      expect(favSlots).toBeGreaterThan(0);
      // Shuffle has no favorites input: most favorite accessory slots move at some n.
      expect(rotated / favSlots).toBeGreaterThanOrEqual(0.5);
    },
    BUDGET_MS,
  );
});

// ---- Traceability (AC4) ----

describe("T-0563 traceability (AC4)", () => {
  const ids = ["R7-E28", "R7-E29", "R7-E30"];

  it("rule-0.2 (AC4) rule 7.2 records R7-E28…E30 and Required tests list the histories and P1–P5", () => {
    const r72 = doc.slice(doc.indexOf("### 7.2 "), doc.indexOf("### 7.3 "));
    for (const id of ids) {
      expect(r72.split("\n").filter((l) => l.startsWith(`- **${id} `))).toHaveLength(1);
    }
    const required = doc.slice(doc.indexOf("## Required tests"), doc.indexOf("## Traceability"));
    const line = required.split("\n").find((l) => l.startsWith("- With favorites (rule 0.2"));
    expect(line).toBeDefined();
    for (const token of [...ids, "P1", "P2", "P3", "P4", "P5"]) expect(line).toContain(token);
    const table = doc.slice(doc.indexOf("## Traceability"));
    expect(table.split("\n").filter((l) => /^\|.*\|\s*T-0563\s*\|$/.test(l))).toEqual([
      "| 0.2 favorites: simulated histories (R7-E28…E30) and properties P1–P5 (D-0202 §3) | T-0563 |",
    ]);
  });

  it("rule-0.2 (AC4) every new example id is named in a test title", () => {
    const titleRe = /\b(?:it|test)(?:\.each\([\s\S]*?\))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const titles: string[] = [];
    for (const f of readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.ts"))) {
      const text = readFileSync(path.join(TEST_DIR, f), "utf8");
      for (const m of text.matchAll(titleRe)) titles.push(m[2] ?? "");
    }
    const missing = [...ids, "P1", "P2", "P3", "P4", "P5"].filter(
      (id) => !titles.some((t) => new RegExp(`(^|[^\\w-])${id}(?![\\w])`).test(t)),
    );
    expect(missing).toEqual([]);
  });
});
