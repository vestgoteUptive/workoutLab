// T-0414 (D-0140): the swap fixtures. P1 + L1, and the L1-style rows the swaps bring in.
import type { LibraryExercise } from "@workoutlab/shared";
import type { FocusCtx, FocusState, LoggedSet } from "../machine.js";
import { initialFocusState } from "../machine.js";
import { BENCH, L1, P1, PLANK, ROW, S1 } from "./fixtures.js";

export const T0 = 1_000_000;
export const PAUSE_AT = T0 + 1000;
export const SWAP_AT = T0 + 2000;
export const RESUME_AT = T0 + 30_000;

type Item = (typeof P1.items)[number];

function lib(id: string, extra: Partial<LibraryExercise>): LibraryExercise {
  return {
    id,
    name: id,
    kind: "exercise",
    type: "compound",
    level: "beginner",
    equipment: [],
    areas: {},
    timed: false,
    defaultDurationS: null,
    incrementKg: 2.5,
    externalLoad: true,
    ...extra,
  };
}

export const DB_BENCH_EX = lib("db-bench-press", { areas: { chest: 1 } });
export const DB_ROW_EX = lib("db-row", { areas: { back: 1, arms: 0.5 } });
export const SIDE_PLANK_EX = lib("side-plank", {
  type: "isolation",
  areas: { core: 1 },
  timed: true,
  defaultDurationS: 45,
  incrementKg: 0,
  externalLoad: false,
});
export const LIB: LibraryExercise[] = [...L1, DB_BENCH_EX, DB_ROW_EX, SIDE_PLANK_EX];

export const BEFORE: FocusCtx = { plan: P1, library: LIB };
export const DB_BENCH: Item = { ...BENCH, exerciseId: "db-bench-press", sets: 3 };
export const DB_ROW: Item = { ...ROW, exerciseId: "db-row", sets: 2 };
export const SIDE_PLANK: Item = { ...PLANK, exerciseId: "side-plank", sets: 1 };

export function swapped(index: number, item: Item, library = LIB): FocusCtx {
  return {
    plan: { ...P1, items: P1.items.map((it, k) => (k === index ? item : it)) },
    library,
  };
}

export function at(phase: FocusState["phase"], extra: Partial<FocusState> = {}): FocusState {
  return { ...initialFocusState(S1, P1, T0), phase, timer: null, ...extra };
}

export function logged(
  itemIndex: number,
  setIndex: number,
  extra: Partial<LoggedSet> = {},
): LoggedSet {
  const timed = P1.items[itemIndex]!.repsMin === null;
  return {
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: P1.items[itemIndex]!.exerciseId,
    reps: timed ? null : 6,
    weightKg: timed ? null : 80,
    durationS: timed ? 50 : null,
    rir: null,
    backoff: false,
    ...extra,
  };
}

/** AC2's start: barbell-row set 3 of 3, sets 0 and 1 logged. */
export const AC2_START = at("set", {
  itemIndex: 1,
  setIndex: 2,
  loggedSets: [logged(1, 0), logged(1, 1)],
});

/** An in-memory storage stub. */
export function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
