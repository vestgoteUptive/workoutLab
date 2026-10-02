// UF-09 focus machine (T-0304a, D-0066 §1, D-0111 §4). A pure reducer over the engine's
// `SessionPlan` (principle 3: the plan is the engine's, the machine only walks it).
//
// - It never reads a clock: every event carries `atMs`, and every timer is a wall-clock
//   `{startedAtMs, durationS, pausedMs}` (NFR-TIME-1). Nothing here counts ticks.
// - It never mutates its inputs. An event that doesn't apply to the phase returns the same
//   state object, so the store can skip the write and the notify.
// - `betweenItems` is transient: the store resolves it in the same `dispatch` (D-0111 §5).
import { REST_COMPOUND_S, REST_ISOLATION_S } from "@workoutlab/engine";
import type { LibraryExercise, SessionPlan } from "@workoutlab/shared";
import { remainingS, type FocusTimer } from "./timer.js";

/** The machine states (D-0066 §1). `betweenItems` is never rendered or persisted. */
export type Phase =
  | "getReady"
  | "warmup"
  | "set"
  | "confirm"
  | "rest"
  | "next"
  | "timed"
  | "timeCheck"
  | "paused"
  | "betweenItems"
  | "done";

/** The phases a stored focus state may hold (everything but the transient `betweenItems`). */
export const STORED_PHASES: readonly Phase[] = [
  "getReady",
  "warmup",
  "set",
  "confirm",
  "rest",
  "next",
  "timed",
  "timeCheck",
  "paused",
  "done",
];

/** UF-09.1 Get ready countdown (D-0111 §4). */
export const GET_READY_S = 5;
/** UF-09.6 set-up countdown (D-0066 §10). */
export const NEXT_SETUP_S = 60;

export type { FocusTimer };

/** D-0066 §12's logged set. `setIndex` is 0-based; the back-off set has index `item.sets`. */
export interface LoggedSet {
  clientId: string;
  itemIndex: number;
  setIndex: number;
  exerciseId: string;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  rir: number | null;
  backoff: boolean;
}

/** The focus state, persisted as is to `localStorage["wl-focus:<sessionId>"]` (D-0111 §4). */
export interface FocusState {
  version: 1;
  sessionId: string;
  phase: Phase;
  itemIndex: number;
  setIndex: number;
  warmupIndex: number;
  timer: FocusTimer | null;
  pausedAtMs: number | null;
  resumePhase: Phase | null;
  workoutPausedMs: number;
  /** When the warm-up was entered, moved forward by every pause taken during it, so
   *  `leave − warmupStartedAtMs` is the warm-up time without pauses. `null` outside it. */
  warmupStartedAtMs: number | null;
  warmupSpentMs: number;
  loggedSets: LoggedSet[];
}

export interface FocusCtx {
  plan: SessionPlan;
  library: readonly LibraryExercise[];
}

type At = { atMs: number };

export type FocusEvent =
  | ({ type: "COUNTDOWN_END" } & At)
  | ({ type: "SKIP_WARMUP" } & At)
  | ({ type: "WARMUP_NEXT" } & At)
  | ({ type: "WARMUP_RESTART" } & At)
  | ({ type: "SET_RECORDED"; set: LoggedSet } & At)
  | ({ type: "SAVED"; set?: LoggedSet } & At)
  | ({ type: "REST_END" } & At)
  | ({ type: "REST_ADJUST"; deltaS: number } & At)
  | ({ type: "CHECK_RESOLVED"; to: "next" | "timeCheck" } & At)
  | ({ type: "CONTINUE" } & At)
  | ({ type: "READY" } & At)
  | ({ type: "TIMED_RECORDED"; set: LoggedSet } & At)
  | ({ type: "PAUSE" } & At)
  | ({ type: "RESUME" } & At)
  // T-0304e (D-0071 §5): the `useFocusSession()` writes and helpers. Added, none changed.
  /** A set logged out of order (UF-03.1): only `loggedSets` changes, never the phase. */
  | ({ type: "SET_LOGGED"; set: LoggedSet } & At)
  /** An `editSet` result: the entry with that `clientId` is replaced, in any phase. */
  | ({ type: "SET_EDITED"; set: LoggedSet } & At)
  /** A `deleteSet`: the entry with that `clientId` is removed, in any phase. */
  | ({ type: "SET_DELETED"; clientId: string } & At)
  /** `startRest(exerciseId)`: a fresh wall-clock rest by the library `type`. */
  | ({ type: "REST_START"; exerciseId: string } & At)
  /** `replaceItem(itemIndex, …)` after the write, reduced with the NEW plan in `ctx`. */
  | ({ type: "PLAN_REPLACED"; itemIndex: number } & At)
  /** `close()` from a `keepsClockRunning: true` overlay: re-sync from `loggedSets`. */
  | ({ type: "RESYNC" } & At);

function timerAt(atMs: number, durationS: number): FocusTimer {
  return { startedAtMs: atMs, durationS, pausedMs: 0 };
}

/** The fresh state for a session: UF-09.1 item 0, with the 5 s countdown started at `atMs`. */
export function initialFocusState(sessionId: string, _plan: SessionPlan, atMs: number): FocusState {
  return {
    version: 1,
    sessionId,
    phase: "getReady",
    itemIndex: 0,
    setIndex: 0,
    warmupIndex: 0,
    timer: timerAt(atMs, GET_READY_S),
    pausedAtMs: null,
    resumePhase: null,
    workoutPausedMs: 0,
    warmupStartedAtMs: null,
    warmupSpentMs: 0,
    loggedSets: [],
  };
}

/** The number of sets in an item, counting the back-off set (rule 13). */
export function setsInItem(item: SessionPlan["items"][number]): number {
  return item.sets + (item.backoff ? 1 : 0);
}

/** Rest by library `type` (D-0066 §7). A missing exercise gets the longer, safer rest. */
export function restFor(exerciseId: string, library: readonly LibraryExercise[]): number {
  const exercise = library.find((e) => e.id === exerciseId);
  if (!exercise) return REST_COMPOUND_S;
  return exercise.type === "compound" ? REST_COMPOUND_S : REST_ISOLATION_S;
}

/** The set indexes of item `itemIndex` that have a live logged set. */
function loggedIndexes(state: FocusState, itemIndex: number): Set<number> {
  const out = new Set<number>();
  for (const s of state.loggedSets) if (s.itemIndex === itemIndex) out.add(s.setIndex);
  return out;
}

/** The first set index of item `itemIndex` above `after` with no live logged set, or `null`. */
export function firstUnloggedSet(
  state: FocusState,
  ctx: FocusCtx,
  itemIndex: number,
  after = -1,
): number | null {
  const item = ctx.plan.items[itemIndex];
  if (!item) return null;
  const logged = loggedIndexes(state, itemIndex);
  for (let i = after + 1; i < setsInItem(item); i += 1) if (!logged.has(i)) return i;
  return null;
}

/**
 * The set a rest leads to (D-0071 §5): the first set of the current item, from `setIndex` itself
 * on, with no live logged set. In the normal flow `setIndex` is the set just logged, so this is
 * the next one, and a set already logged from List view is never offered again. A rest started
 * with `startRest` from an unlogged `set`/`timed` leads back to that same set, so it is never
 * skipped. `null` when the item has no set left.
 */
export function setAfterRest(state: FocusState, ctx: FocusCtx): number | null {
  return firstUnloggedSet(state, ctx, state.itemIndex, state.setIndex - 1);
}

/** D-0071 §5: the first item with an unlogged planned set (back-off included), and that set. */
export function firstIncompleteSet(
  state: FocusState,
  ctx: FocusCtx,
): { itemIndex: number; setIndex: number } | null {
  for (let i = 0; i < ctx.plan.items.length; i += 1) {
    const setIndex = firstUnloggedSet(state, ctx, i);
    if (setIndex !== null) return { itemIndex: i, setIndex };
  }
  return null;
}

/** The phases from which `startRest` starts a rest: around a set, never mid-countdown. */
const REST_STARTABLE: ReadonlySet<Phase> = new Set<Phase>(["set", "confirm", "rest", "timed"]);

/** Entering item `itemIndex`: `timed` when its `repsMin` is null, else `set`; `done` past the end. */
function enterItem(state: FocusState, ctx: FocusCtx, itemIndex: number): FocusState {
  const item = ctx.plan.items[itemIndex];
  if (!item) return { ...state, phase: "done", timer: null };
  return {
    ...state,
    phase: item.repsMin === null ? "timed" : "set",
    itemIndex,
    setIndex: 0,
    timer: null,
  };
}

function startWarmupMove(state: FocusState, ctx: FocusCtx, index: number, atMs: number) {
  const move = ctx.plan.warmup[index]!;
  return {
    ...state,
    phase: "warmup" as const,
    warmupIndex: index,
    timer: timerAt(atMs, move.durationS),
  };
}

/** After a set is logged and saved: rest, or `done` after the last set of the last item. */
function afterSet(state: FocusState, ctx: FocusCtx, atMs: number): FocusState {
  const item = ctx.plan.items[state.itemIndex]!;
  const lastSetOfItem = state.setIndex + 1 >= setsInItem(item);
  const lastItem = state.itemIndex + 1 >= ctx.plan.items.length;
  if (lastSetOfItem && lastItem) return { ...state, phase: "done", timer: null };
  return { ...state, phase: "rest", timer: timerAt(atMs, restFor(item.exerciseId, ctx.library)) };
}

/** The reducer stamps the position fields, so a logged entry always matches the set it ends. */
function stamp(state: FocusState, ctx: FocusCtx, set: LoggedSet): LoggedSet {
  const item = ctx.plan.items[state.itemIndex]!;
  return {
    ...set,
    itemIndex: state.itemIndex,
    setIndex: state.setIndex,
    exerciseId: item.exerciseId,
    backoff: state.setIndex >= item.sets,
  };
}

const PAUSABLE: ReadonlySet<Phase> = new Set<Phase>([
  "getReady",
  "warmup",
  "set",
  "confirm",
  "rest",
  "next",
  "timed",
  "timeCheck",
]);

/**
 * `focusReducer(state, event, ctx)`: the D-0111 §4 transitions. Pure: no clock, no I/O, no
 * mutation. An event that doesn't apply returns `state` itself (reference-equal).
 */
export function focusReducer(state: FocusState, event: FocusEvent, ctx: FocusCtx): FocusState {
  const { plan } = ctx;
  switch (event.type) {
    case "COUNTDOWN_END": {
      if (state.phase !== "getReady") return state;
      if (plan.warmup.length > 0) {
        return { ...startWarmupMove(state, ctx, 0, event.atMs), warmupStartedAtMs: event.atMs };
      }
      return enterItem(state, ctx, 0);
    }
    case "SKIP_WARMUP": {
      if (state.phase !== "getReady") return state;
      return { ...enterItem(state, ctx, 0), warmupSpentMs: 0, warmupStartedAtMs: null };
    }
    case "WARMUP_NEXT": {
      if (state.phase !== "warmup") return state;
      const next = state.warmupIndex + 1;
      if (next < plan.warmup.length) return startWarmupMove(state, ctx, next, event.atMs);
      const spent = Math.max(0, event.atMs - (state.warmupStartedAtMs ?? event.atMs));
      const left = { ...state, warmupSpentMs: spent, warmupStartedAtMs: null };
      if (plan.items.length === 0) return { ...left, phase: "done", timer: null };
      return {
        ...left,
        phase: "next",
        itemIndex: 0,
        setIndex: 0,
        timer: timerAt(event.atMs, NEXT_SETUP_S),
      };
    }
    case "WARMUP_RESTART": {
      if (state.phase !== "warmup") return state;
      return startWarmupMove(state, ctx, state.warmupIndex, event.atMs);
    }
    case "READY": {
      if (state.phase !== "next") return state;
      return enterItem(state, ctx, state.itemIndex);
    }
    case "SET_RECORDED": {
      if (state.phase !== "set") return state;
      return {
        ...state,
        phase: "confirm",
        timer: null,
        loggedSets: [...state.loggedSets, stamp(state, ctx, event.set)],
      };
    }
    case "SAVED": {
      if (state.phase !== "confirm") return state;
      const edited = event.set;
      const withEdit = edited
        ? {
            ...state,
            loggedSets: state.loggedSets.map((s) =>
              s.clientId === edited.clientId ? stamp(state, ctx, edited) : s,
            ),
          }
        : state;
      return afterSet(withEdit, ctx, event.atMs);
    }
    case "TIMED_RECORDED": {
      if (state.phase !== "timed") return state;
      const logged = { ...state, loggedSets: [...state.loggedSets, stamp(state, ctx, event.set)] };
      return afterSet(logged, ctx, event.atMs);
    }
    case "REST_END": {
      if (state.phase !== "rest") return state;
      const item = plan.items[state.itemIndex]!;
      const nextSet = setAfterRest(state, ctx);
      if (nextSet !== null) {
        return {
          ...state,
          phase: item.repsMin === null ? "timed" : "set",
          setIndex: nextSet,
          timer: null,
        };
      }
      return { ...state, phase: "betweenItems", timer: null };
    }
    case "REST_ADJUST": {
      if (state.phase !== "rest" || !state.timer) return state;
      const remaining = remainingS(state.timer, event.atMs);
      const target = Math.max(0, remaining + event.deltaS);
      if (target === remaining) return state;
      return {
        ...state,
        timer: { ...state.timer, durationS: state.timer.durationS + (target - remaining) },
      };
    }
    case "CHECK_RESOLVED": {
      if (state.phase !== "betweenItems") return state;
      const itemIndex = state.itemIndex + 1;
      if (event.to === "timeCheck") {
        return { ...state, phase: "timeCheck", itemIndex, setIndex: 0, timer: null };
      }
      return {
        ...state,
        phase: "next",
        itemIndex,
        setIndex: 0,
        timer: timerAt(event.atMs, NEXT_SETUP_S),
      };
    }
    case "CONTINUE": {
      if (state.phase !== "timeCheck") return state;
      return { ...state, phase: "next", setIndex: 0, timer: timerAt(event.atMs, NEXT_SETUP_S) };
    }
    case "PAUSE": {
      if (!PAUSABLE.has(state.phase)) return state;
      return { ...state, phase: "paused", resumePhase: state.phase, pausedAtMs: event.atMs };
    }
    case "RESUME": {
      if (state.phase !== "paused" || state.resumePhase === null || state.pausedAtMs === null) {
        return state;
      }
      const pausedFor = Math.max(0, event.atMs - state.pausedAtMs);
      return {
        ...state,
        phase: state.resumePhase,
        resumePhase: null,
        pausedAtMs: null,
        workoutPausedMs: state.workoutPausedMs + pausedFor,
        timer: state.timer ? { ...state.timer, pausedMs: state.timer.pausedMs + pausedFor } : null,
        warmupStartedAtMs:
          state.resumePhase === "warmup" && state.warmupStartedAtMs !== null
            ? state.warmupStartedAtMs + pausedFor
            : state.warmupStartedAtMs,
      };
    }
    case "SET_LOGGED":
      return { ...state, loggedSets: [...state.loggedSets, event.set] };
    case "SET_EDITED": {
      const { set } = event;
      if (!state.loggedSets.some((s) => s.clientId === set.clientId)) return state;
      return {
        ...state,
        loggedSets: state.loggedSets.map((s) => (s.clientId === set.clientId ? set : s)),
      };
    }
    case "SET_DELETED": {
      const loggedSets = state.loggedSets.filter((s) => s.clientId !== event.clientId);
      if (loggedSets.length === state.loggedSets.length) return state;
      return { ...state, loggedSets };
    }
    case "REST_START": {
      if (!REST_STARTABLE.has(state.phase)) return state;
      return {
        ...state,
        phase: "rest",
        timer: timerAt(event.atMs, restFor(event.exerciseId, ctx.library)),
      };
    }
    case "PLAN_REPLACED":
      return planReplaced(state, ctx, event.itemIndex);
    case "RESYNC":
      return resync(state, ctx, event.atMs);
    default:
      return state;
  }
}

/** After `replaceItem` on the current item: the set phase follows the new item (`timed` when its
 *  `repsMin` is null), and `setIndex` stays, kept inside the new item's set count. */
function planReplaced(state: FocusState, ctx: FocusCtx, itemIndex: number): FocusState {
  if (itemIndex !== state.itemIndex) return state;
  const item = ctx.plan.items[itemIndex];
  if (!item) return state;
  const entry: Phase = item.repsMin === null ? "timed" : "set";
  const fix = (p: Phase): Phase => (p === "set" || p === "timed" ? entry : p);
  const setIndex = Math.max(0, Math.min(state.setIndex, setsInItem(item) - 1));
  const phase = fix(state.phase);
  const resumePhase = state.resumePhase === null ? null : fix(state.resumePhase);
  if (phase === state.phase && resumePhase === state.resumePhase && setIndex === state.setIndex) {
    return state;
  }
  return { ...state, phase, resumePhase, setIndex };
}

/** D-0071 §5 `close()` re-sync. A running rest stays. Otherwise the machine goes to the first
 *  item with an unlogged planned set, at that set, or to `done` when every set is logged. The
 *  step already on screen for that position (UF-09.6 set-up, the set itself) is kept, and so is
 *  a warm-up with nothing logged yet. */
function resync(state: FocusState, ctx: FocusCtx, atMs: number): FocusState {
  const { phase } = state;
  if (phase === "paused" || phase === "done" || phase === "betweenItems") return state;
  if (phase === "rest" && state.timer) return state;
  const inWarmup = phase === "getReady" || phase === "warmup";
  if (inWarmup && state.loggedSets.length === 0) return state;
  const left = inWarmup
    ? {
        ...state,
        warmupStartedAtMs: null,
        warmupSpentMs:
          phase === "warmup" && state.warmupStartedAtMs !== null
            ? Math.max(0, atMs - state.warmupStartedAtMs)
            : state.warmupSpentMs,
      }
    : state;
  const target = firstIncompleteSet(state, ctx);
  if (!target) return { ...left, phase: "done", timer: null };
  const item = ctx.plan.items[target.itemIndex]!;
  const entry: Phase = item.repsMin === null ? "timed" : "set";
  const samePosition = target.itemIndex === state.itemIndex && target.setIndex === state.setIndex;
  if (
    samePosition &&
    (phase === entry || ((phase === "next" || phase === "timeCheck") && target.setIndex === 0))
  ) {
    return state;
  }
  return {
    ...left,
    phase: entry,
    itemIndex: target.itemIndex,
    setIndex: target.setIndex,
    timer: null,
  };
}
