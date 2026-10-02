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
  | ({ type: "RESUME" } & At);

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
      const nextSet = state.setIndex + 1;
      if (nextSet < setsInItem(item)) {
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
    default:
      return state;
  }
}
