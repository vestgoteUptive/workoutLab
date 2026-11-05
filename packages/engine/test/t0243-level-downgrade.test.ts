// T-0243 UF-08.2 UF-08.5 UF-05.1 UF-11.6 (D-0233, D-0230, D-0202): regression guards for a
// level change. Rule 0 (`isEligible`, level ≤ profile level) already reads `profile.level` on
// every call, so a downgrade must make an above-level favorite (rule 0.2), pin or mainLiftId
// a silent skip, deep-equal to leaving it out, and rankSwaps (rule 12) must drop it. An upgrade
// must let pull-up in at the spec AC11 inputs (D-0233 §5). Expected values are literals or
// deep-equality against the same call without the id (no snapshot), over the simulated
// 14-day histories plus zero history.
import { describe, expect, it } from "vitest";
import {
  applySwap,
  isEligible,
  rankSwaps,
  suggest,
  type AreaTarget,
  type HistorySet,
  type Level,
  type LibraryExercise,
  type SessionInput,
  type SuggestProfile,
  type Workout,
} from "@workoutlab/engine";
import {
  F_INPUT,
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  nameFromId,
  sessionOf,
} from "./fixtures/common.js";
import { SIMULATED_HISTORIES } from "./fixtures/histories.js";

const PULL_UP = "pull-up";
const ADV = "barbell-deadlift-t";
const BUDGETS = [20, 30, 45, 60] as const;

/** The AC1 histories: every SIMULATED_HISTORIES entry plus zero history. */
const HISTORIES: ReadonlyArray<readonly [string, readonly HistorySet[]]> = [
  ["zero", []],
  ...Object.entries(SIMULATED_HISTORIES),
];

/** Test-local advanced row, the same shape as the fixture's (unexported) `ex()` helper. */
const ADVANCED_ROW: LibraryExercise = {
  id: ADV,
  name: nameFromId(ADV),
  kind: "exercise",
  type: "compound",
  level: "advanced",
  equipment: ["barbell"],
  areas: { hamstrings: 1, glutes: 1, back: 0.5 },
  timed: false,
  defaultDurationS: null,
  incrementKg: 2.5,
  externalLoad: true,
};
const LIBRARY_ADV: LibraryExercise[] = [...LIBRARY, ADVANCED_ROW];

const at = (level: Level): SuggestProfile => ({ ...F_PROFILE, level });

/** One full `suggest` input, so paired cases can be diffed (AC7). */
interface Call {
  history: readonly HistorySet[];
  targets: readonly AreaTarget[];
  profile: SuggestProfile;
  library: readonly LibraryExercise[];
  input: SessionInput;
  now: string;
  tz: string;
}

function call(overrides: Partial<Omit<Call, "input">> & { input?: Partial<SessionInput> }): Call {
  return {
    history: overrides.history ?? [],
    targets: overrides.targets ?? F_TARGETS,
    profile: overrides.profile ?? at("beginner"),
    library: overrides.library ?? LIBRARY,
    input: { ...F_INPUT, ...overrides.input },
    now: overrides.now ?? NOW,
    tz: overrides.tz ?? TZ,
  };
}

/** AC7 (R0-E1): runs `suggest` twice and asserts the two results are deep-equal. */
function run(c: Call): Workout {
  const go = (): Workout =>
    suggest(c.history, c.targets, c.profile, c.library, c.input, c.now, c.tz);
  const first = go();
  expect(go()).toEqual(first);
  return first;
}

/** AC7: the dotted paths at which two inputs differ (recursing into plain objects only). */
function diffPaths(a: unknown, b: unknown, prefix = ""): string[] {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diffPaths(a[k], b[k], prefix === "" ? k : `${prefix}.${k}`));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}

const ids = (w: Workout): string[] => w.plan.items.map((i) => i.exerciseId);

describe("T-0243 AC7 helper", () => {
  it("T-0243 AC7 diffPaths reports exactly the differing paths", () => {
    expect(diffPaths(call({}), call({}))).toEqual([]);
    expect(diffPaths(call({}), call({ profile: at("intermediate") }))).toEqual(["profile.level"]);
    expect(diffPaths(call({}), call({ input: { pinnedIds: [PULL_UP] } }))).toEqual([
      "input.pinnedIds",
    ]);
  });
});

describe("T-0243 level downgrade: above-level ids are skipped (rule 0, rule 0.2, rule 7.2)", () => {
  it("T-0243 AC1 (spec AC13) beginner + favorite pull-up: never an item, never main, deep-equal to favoriteIds [] over every history × budget", () => {
    let cases = 0;
    let pickedAtIntermediate = 0;
    for (const [name, history] of HISTORIES) {
      for (const budgetMin of BUDGETS) {
        const label = `${name} ${budgetMin} min`;
        const fav = call({ history, input: { budgetMin, favoriteIds: [PULL_UP] } });
        const none = call({ history, input: { budgetMin, favoriteIds: [] } });
        expect(diffPaths(fav, none), label).toEqual(["input.favoriteIds"]);
        const w = run(fav);
        expect(ids(w), label).not.toContain(PULL_UP);
        expect(w.plan.mainLiftId, label).not.toBe(PULL_UP);
        expect(w, label).toEqual(run(none));
        cases++;
        // Non-vacuity: the paired intermediate call (only profile.level differs) can pick it.
        const up = { ...fav, profile: at("intermediate") };
        expect(diffPaths(fav, up), label).toEqual(["profile.level"]);
        if (ids(run(up)).includes(PULL_UP)) pickedAtIntermediate++;
      }
    }
    expect(cases).toBe(20);
    expect(pickedAtIntermediate).toBeGreaterThan(0);
  });

  it("T-0243 AC2 beginner + pinnedIds [pull-up], zero history: no throw, deep-equal to pinnedIds []", () => {
    const pin = call({ input: { pinnedIds: [PULL_UP] } });
    const none = call({ input: { pinnedIds: [] } });
    expect(diffPaths(pin, none)).toEqual(["input.pinnedIds"]);
    let w: Workout | undefined;
    expect(() => {
      w = run(pin);
    }).not.toThrow();
    expect(ids(w as Workout)).not.toContain(PULL_UP);
    expect(w).toEqual(run(none));
  });

  it("T-0243 AC2 beginner + pinnedIds [pull-up] at budgetMin 30: no throw, deep-equal to pinnedIds [] over every simulated history", () => {
    for (const [name, history] of Object.entries(SIMULATED_HISTORIES)) {
      const pin = call({ history, input: { budgetMin: 30, pinnedIds: [PULL_UP] } });
      const none = call({ history, input: { budgetMin: 30, pinnedIds: [] } });
      expect(diffPaths(pin, none), name).toEqual(["input.pinnedIds"]);
      expect(() => run(pin), name).not.toThrow();
      const w = run(pin);
      expect(ids(w), name).not.toContain(PULL_UP);
      expect(w, name).toEqual(run(none));
    }
  });

  it("T-0243 AC3 beginner + mainLiftId pull-up: deep-equal to mainLiftId absent (null), over zero and every simulated history", () => {
    for (const [name, history] of HISTORIES) {
      const main = call({ history, input: { mainLiftId: PULL_UP } });
      const none = call({ history, input: { mainLiftId: null } });
      expect(diffPaths(main, none), name).toEqual(["input.mainLiftId"]);
      let w: Workout | undefined;
      expect(() => {
        w = run(main);
      }, name).not.toThrow();
      expect((w as Workout).plan.mainLiftId, name).not.toBe(PULL_UP);
      expect(ids(w as Workout), name).not.toContain(PULL_UP);
      expect(w, name).toEqual(run(none));
    }
  });
});

describe("T-0243 level upgrade: pull-up reaches the plan (spec AC11, D-0233 §5)", () => {
  // F-input (budgetMin 30), zero history (so back is not recovering), no avoidAreas.
  const beginner = call({ input: { pinnedIds: [PULL_UP] } });
  const intermediate = { ...beginner, profile: at("intermediate") };
  const advanced = { ...beginner, profile: at("advanced") };

  it("T-0243 AC4 the AC11 inputs: zero history, budgetMin 30, back neither avoided nor recovering", () => {
    expect(beginner.input.budgetMin).toBe(30);
    expect(beginner.history).toEqual([]);
    expect(beginner.input.avoidAreas ?? []).not.toContain("back");
  });

  it("T-0243 AC4 intermediate + pinned pull-up at budgetMin 30: pull-up is an item; not deep-equal to beginner", () => {
    expect(diffPaths(beginner, intermediate)).toEqual(["profile.level"]);
    const w = run(intermediate);
    expect(ids(w)).toContain(PULL_UP);
    expect(w.itemsTotalS).toBeLessThanOrEqual(30 * 60 - 180);
    const b = run(beginner);
    expect(ids(b)).not.toContain(PULL_UP);
    expect(w).not.toEqual(b);
  });

  it("T-0243 AC4 advanced is deep-equal to intermediate for these inputs (L1 has no advanced row)", () => {
    expect(LIBRARY.filter((e) => e.level === "advanced")).toEqual([]);
    expect(diffPaths(intermediate, advanced)).toEqual(["profile.level"]);
    expect(run(advanced)).toEqual(run(intermediate));
  });
});

describe("T-0243 rule 12 swaps across a level change", () => {
  const beginnerW = run(call({}));
  const backItem = beginnerW.plan.items.find((i) => {
    const e = LIBRARY.find((x) => x.id === i.exerciseId);
    return e !== undefined && e.areas.back === 1;
  });

  const rank = (current: string, level: Level, w: Workout, library = LIBRARY) =>
    rankSwaps(current, null, w, at(level), library, [], NOW, TZ);

  it("T-0243 AC5 the F-input suggestion has a back item", () => {
    expect(backItem).toBeDefined();
  });

  it("T-0243 AC5 rankSwaps for the back item: no pull-up at beginner, pull-up at intermediate, no throw", () => {
    const current = (backItem as { exerciseId: string }).exerciseId;
    expect(() => rank(current, "beginner", beginnerW)).not.toThrow();
    expect(() => rank(current, "intermediate", beginnerW)).not.toThrow();
    const low = rank(current, "beginner", beginnerW).map((c) => c.exerciseId);
    const high = rank(current, "intermediate", beginnerW).map((c) => c.exerciseId);
    expect(low.length).toBeGreaterThan(0);
    expect(low).not.toContain(PULL_UP);
    expect(high).toContain(PULL_UP);
    expect(high.filter((x) => x !== PULL_UP)).toEqual(low);
  });

  it("T-0243 AC5 after a downgrade, rankSwaps and applySwap with an above-level current (pull-up) don't throw", () => {
    const upW = run(call({ profile: at("intermediate"), input: { pinnedIds: [PULL_UP] } }));
    expect(ids(upW)).toContain(PULL_UP);
    let list: ReturnType<typeof rank> = [];
    expect(() => {
      list = rank(PULL_UP, "beginner", upW);
    }).not.toThrow();
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((c) => c.exerciseId)).not.toContain(PULL_UP);
    const target = (list[0] as { exerciseId: string }).exerciseId;
    let swapped: Workout | undefined;
    expect(() => {
      swapped = applySwap(upW, PULL_UP, target, null, [], at("beginner"), LIBRARY, NOW, TZ);
    }).not.toThrow();
    expect(ids(swapped as Workout)).not.toContain(PULL_UP);
    expect(ids(swapped as Workout)).toContain(target);
  });

  it("T-0243 AC5 rankSwaps drops the advanced row at intermediate and offers it at advanced", () => {
    // A hand-built session (rule 7.1 costs) with romanian-deadlift, which shares the
    // advanced row's primary areas.
    const w = sessionOf(
      [
        ["bench-press", 3, true],
        ["romanian-deadlift", 3],
      ],
      {},
      LIBRARY_ADV,
    );
    const cur = "romanian-deadlift";
    const mid = rank(cur, "intermediate", w, LIBRARY_ADV).map((c) => c.exerciseId);
    const top = rank(cur, "advanced", w, LIBRARY_ADV).map((c) => c.exerciseId);
    expect(mid).not.toContain(ADV);
    expect(top).toContain(ADV);
  });
});

describe("T-0243 advanced row (test-local, rule 0)", () => {
  it("T-0243 AC6 at intermediate the advanced row is never an item as favorite, pin or mainLiftId, deep-equal to leaving it out, over every AC1 input", () => {
    let cases = 0;
    for (const [name, history] of HISTORIES) {
      for (const budgetMin of BUDGETS) {
        for (const field of ["favoriteIds", "pinnedIds", "mainLiftId"] as const) {
          const label = `${name} ${budgetMin} min ${field}`;
          const value = field === "mainLiftId" ? ADV : [ADV];
          const empty = field === "mainLiftId" ? null : [];
          const base = { history, profile: at("intermediate"), library: LIBRARY_ADV };
          const withIt = call({ ...base, input: { budgetMin, [field]: value } });
          const without = call({ ...base, input: { budgetMin, [field]: empty } });
          expect(diffPaths(withIt, without), label).toEqual([`input.${field}`]);
          const w = run(withIt);
          expect(ids(w), label).not.toContain(ADV);
          expect(w.plan.mainLiftId, label).not.toBe(ADV);
          expect(w, label).toEqual(run(without));
          cases++;
        }
      }
    }
    expect(cases).toBe(60);
  });

  it("T-0243 AC6 isEligible: the advanced row is false below advanced and true at advanced", () => {
    expect(isEligible(ADVANCED_ROW, at("beginner"))).toBe(false);
    expect(isEligible(ADVANCED_ROW, at("intermediate"))).toBe(false);
    expect(isEligible(ADVANCED_ROW, at("advanced"))).toBe(true);
  });

  it("T-0243 AC6 at advanced a pinned advanced row is an item (paired with intermediate, only level differs)", () => {
    const mid = call({
      profile: at("intermediate"),
      library: LIBRARY_ADV,
      input: { pinnedIds: [ADV] },
    });
    const top = { ...mid, profile: at("advanced") };
    expect(diffPaths(mid, top)).toEqual(["profile.level"]);
    expect(ids(run(top))).toContain(ADV);
    expect(ids(run(mid))).not.toContain(ADV);
  });

  it("T-0243 AC6 level ranks are ordered: pull-up eligible at intermediate and advanced, not at beginner", () => {
    const pull = LIBRARY.find((e) => e.id === PULL_UP) as LibraryExercise;
    expect(pull.level).toBe("intermediate");
    expect(isEligible(pull, at("beginner"))).toBe(false);
    expect(isEligible(pull, at("intermediate"))).toBe(true);
    expect(isEligible(pull, at("advanced"))).toBe(true);
  });
});
