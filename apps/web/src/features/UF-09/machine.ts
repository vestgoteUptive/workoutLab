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
/** UF-09.4 auto-save after an untouched confirm (D-0118 §2, NFR-TIME-1). */
export const AUTOSAVE_S = 5;
/** UF-09.7 "Get in position" before the hold (D-0119 §1). One timer runs position + hold. */
export const POSITION_S = 3;
/** The hold when neither the pre-fill nor the item has a duration (D-0119 §1). */
export const DEFAULT_HOLD_S = 45;

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
  /** UF-09.7's ring-only pause (T-0304c, D-0119 §2): when "Pause timer" was tapped, else `null`.
   *  Only the `timed` timer stops; `workoutPausedMs` (rule 8's elapsed time) doesn't move. */
  timerPausedAtMs: number | null;
  /** UF-09.9 "Skip to next exercise" (T-0304d, D-0120 §7): the items left unfinished on purpose.
   *  The plan keeps them; the re-sync treats them as complete. Older stored states read `[]`. */
  skippedItems: number[];
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
  | ({ type: "RESYNC" } & At)
  // T-0304b (D-0118 §2 §3): a touch on UF-09.4 stops the auto-save. Added, none changed.
  | ({ type: "AUTOSAVE_CANCEL" } & At)
  // T-0304c (D-0119 §2): UF-09.7's ring-only pause. Valid only in `timed`. Added, none changed.
  | ({ type: "TIMER_PAUSE" } & At)
  | ({ type: "TIMER_RESUME" } & At)
  /** T-0304c (D-0119 §3): a hold at 0 whose set is already logged (of this exercise, T-0410)
   *  moves on as its TIMED_RECORDED would have, with no second entry. Otherwise a no-op. */
  | ({ type: "HOLD_ALREADY_LOGGED" } & At)
  // T-0304d (D-0120 §1 §7). Added, none changed.
  /** A time-check option was written (Trim / Skip next), reduced with the NEW plan in `ctx`:
   *  UF-09.8 goes to UF-09.6 at the same `itemIndex`, or to `done` when nothing is left. */
  | ({ type: "PLAN_APPLIED" } & At)
  /** UF-09.9 "Skip to next exercise": ends the pause and leaves the current item (or the
   *  warm-up). Valid only in `paused`. */
  | ({ type: "SKIP_ITEM" } & At);

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
    timerPausedAtMs: null,
    skippedItems: [],
  };
}

/** The number of sets in an item, counting the back-off set (rule 13). */
export function setsInItem(item: SessionPlan["items"][number]): number {
  return item.sets + (item.backoff ? 1 : 0);
}

/** The hold of a timed item (D-0119 §1, principle 3): the engine's `prefill.durationS`, else the
 *  item's `durationS`, else 45 s. */
export function holdSeconds(item: SessionPlan["items"][number]): number {
  return item.prefill.durationS ?? item.durationS ?? DEFAULT_HOLD_S;
}

/** The one `timed` timer (D-0119 §1): 3 s to get in position, then the hold, from `atMs`. */
function timedTimer(ctx: FocusCtx, itemIndex: number, atMs: number): FocusTimer {
  const item = ctx.plan.items[itemIndex]!;
  return timerAt(atMs, POSITION_S + holdSeconds(item));
}

/** The `timed` time left at `nowMs`: frozen at the ring pause while "Pause timer" holds it. */
export function timedRemainingS(state: FocusState, nowMs: number): number {
  if (!state.timer) return 0;
  return remainingS(state.timer, state.timerPausedAtMs ?? nowMs);
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

/** D-0071 §5: the first item with an unlogged planned set (back-off included), and that set.
 *  An item skipped on UF-09.9 counts as complete (D-0120 §7). */
export function firstIncompleteSet(
  state: FocusState,
  ctx: FocusCtx,
): { itemIndex: number; setIndex: number } | null {
  const skipped = state.skippedItems ?? [];
  for (let i = 0; i < ctx.plan.items.length; i += 1) {
    if (skipped.includes(i)) continue;
    const setIndex = firstUnloggedSet(state, ctx, i);
    if (setIndex !== null) return { itemIndex: i, setIndex };
  }
  return null;
}

/** The phases from which `startRest` starts a rest: around a set, never mid-countdown. */
const REST_STARTABLE: ReadonlySet<Phase> = new Set<Phase>(["set", "confirm", "rest", "timed"]);

/** Entering item `itemIndex`: `timed` when its `repsMin` is null, else `set`; `done` past the end. */
function enterItem(state: FocusState, ctx: FocusCtx, itemIndex: number, atMs: number): FocusState {
  const item = ctx.plan.items[itemIndex];
  if (!item) return { ...state, phase: "done", timer: null };
  const timed = item.repsMin === null;
  return {
    ...state,
    phase: timed ? "timed" : "set",
    itemIndex,
    setIndex: 0,
    timer: timed ? timedTimer(ctx, itemIndex, atMs) : null,
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

/** A library entry known to be bodyweight (`externalLoad: false`); a missing entry is not. */
export function isBodyweight(exerciseId: string, library: readonly LibraryExercise[]): boolean {
  return library.find((e) => e.id === exerciseId)?.externalLoad === false;
}

/** The confirm auto-save (D-0118 §2): 5 s from the record, except a `null` weight on a lift not
 *  known to be bodyweight, which means "ask" (D-0066 §4) and waits for Save. */
function autosaveTimer(set: LoggedSet, ctx: FocusCtx, atMs: number): FocusTimer | null {
  if (set.weightKg === null && !isBodyweight(set.exerciseId, ctx.library)) return null;
  return timerAt(atMs, AUTOSAVE_S);
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
  const next = transition(state, event, ctx);
  if (next === state || next.timerPausedAtMs === null) return next;
  // The ring pause belongs to one `timed` timer: leaving `timed`, or a new timer, drops it.
  const running = next.phase === "paused" ? next.resumePhase : next.phase;
  if (running === "timed" && next.timer === state.timer) return next;
  return { ...next, timerPausedAtMs: null };
}

function transition(state: FocusState, event: FocusEvent, ctx: FocusCtx): FocusState {
  const { plan } = ctx;
  switch (event.type) {
    case "COUNTDOWN_END": {
      if (state.phase !== "getReady") return state;
      if (plan.warmup.length > 0) {
        return { ...startWarmupMove(state, ctx, 0, event.atMs), warmupStartedAtMs: event.atMs };
      }
      return enterItem(state, ctx, 0, event.atMs);
    }
    case "SKIP_WARMUP": {
      if (state.phase !== "getReady") return state;
      return {
        ...enterItem(state, ctx, 0, event.atMs),
        warmupSpentMs: 0,
        warmupStartedAtMs: null,
      };
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
      return enterItem(state, ctx, state.itemIndex, event.atMs);
    }
    case "SET_RECORDED": {
      if (state.phase !== "set") return state;
      const set = stamp(state, ctx, event.set);
      return {
        ...state,
        phase: "confirm",
        timer: autosaveTimer(set, ctx, event.atMs),
        loggedSets: [...state.loggedSets, set],
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
        const timed = item.repsMin === null;
        return {
          ...state,
          phase: timed ? "timed" : "set",
          setIndex: nextSet,
          timer: timed ? timedTimer(ctx, state.itemIndex, event.atMs) : null,
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
      // Nothing follows (a rest started after the last set): the workout is over.
      if (itemIndex >= plan.items.length) return { ...state, phase: "done", timer: null };
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
      // A ring already paused by "Pause timer" keeps its own pause, which covers this time too:
      // adding it here as well would count it twice (D-0119 §2).
      const ringHeld = state.resumePhase === "timed" && state.timerPausedAtMs !== null;
      const resumed: FocusState = {
        ...state,
        phase: state.resumePhase,
        resumePhase: null,
        pausedAtMs: null,
        workoutPausedMs: state.workoutPausedMs + pausedFor,
        timer:
          state.timer && !ringHeld
            ? { ...state.timer, pausedMs: state.timer.pausedMs + pausedFor }
            : state.timer,
        warmupStartedAtMs:
          state.resumePhase === "warmup" && state.warmupStartedAtMs !== null
            ? state.warmupStartedAtMs + pausedFor
            : state.warmupStartedAtMs,
      };
      return movedOnIfLogged(resumed, ctx, event.atMs);
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
    case "AUTOSAVE_CANCEL": {
      if (state.phase !== "confirm" || state.timer === null) return state;
      return { ...state, timer: null };
    }
    case "TIMER_PAUSE": {
      if (state.phase !== "timed" || !state.timer || state.timerPausedAtMs !== null) return state;
      // A hold already at 0 is ending (the auto-log): there is nothing left to pause.
      if (remainingS(state.timer, event.atMs) === 0) return state;
      return { ...state, timerPausedAtMs: event.atMs };
    }
    case "TIMER_RESUME": {
      if (state.phase !== "timed" || !state.timer || state.timerPausedAtMs === null) return state;
      const heldFor = Math.max(0, event.atMs - state.timerPausedAtMs);
      return {
        ...state,
        timerPausedAtMs: null,
        timer: { ...state.timer, pausedMs: state.timer.pausedMs + heldFor },
      };
    }
    case "PLAN_APPLIED":
      return planApplied(state, ctx, event.atMs);
    case "SKIP_ITEM":
      return skipItem(state, ctx, event.atMs);
    case "HOLD_ALREADY_LOGGED":
      return state.phase === "timed" ? movedOnIfLogged(state, ctx, event.atMs) : state;
    case "PLAN_REPLACED":
      return planReplaced(state, ctx, event.itemIndex, event.atMs);
    case "RESYNC":
      return resync(state, ctx, event.atMs);
    default:
      return state;
  }
}

/**
 * D-0120 §1: after a time-check option is written, `ctx.plan` is the engine's whole new item list.
 * UF-09.8 moves to UF-09.6 (the 60 s set-up) at the same `itemIndex`, or to `done` when the new
 * list has no item from there on. A pause taken while the write was pending stays: the set-up
 * then starts at the pause, so RESUME leaves the full 60 s, and `done` ends the pause (persist.ts
 * rejects `resumePhase: "done"`). Any other phase is a no-op.
 */
function planApplied(state: FocusState, ctx: FocusCtx, atMs: number): FocusState {
  const running = state.phase === "paused" ? state.resumePhase : state.phase;
  if (running !== "timeCheck") return state;
  const nothingLeft = state.itemIndex >= ctx.plan.items.length;
  if (state.phase !== "paused") {
    if (nothingLeft) return { ...state, phase: "done", setIndex: 0, timer: null };
    return { ...state, phase: "next", setIndex: 0, timer: timerAt(atMs, NEXT_SETUP_S) };
  }
  const pausedAtMs = state.pausedAtMs ?? atMs;
  if (nothingLeft) {
    return {
      ...state,
      phase: "done",
      setIndex: 0,
      timer: null,
      resumePhase: null,
      pausedAtMs: null,
      workoutPausedMs: state.workoutPausedMs + Math.max(0, atMs - pausedAtMs),
    };
  }
  return { ...state, resumePhase: "next", setIndex: 0, timer: timerAt(pausedAtMs, NEXT_SETUP_S) };
}

/** Whether UF-09.9 offers "Skip to next exercise" (D-0120 §7): not in a pause taken on UF-09.8
 *  (it has its own Skip next), and only when an item follows the current one. In the warm-up the
 *  current item is item 0, so a one-item plan offers no Skip there either (T-0304d AC-10). */
export function canSkipItem(state: FocusState, ctx: FocusCtx): boolean {
  if (state.phase !== "paused" || state.resumePhase === null) return false;
  if (state.resumePhase === "timeCheck") return false;
  return state.itemIndex + 1 < ctx.plan.items.length;
}

/**
 * D-0120 §7 `SKIP_ITEM`: ends the pause as RESUME does, then leaves what was on screen. From the
 * warm-up (or UF-09.1) it ends the warm-up as its last move would (`warmupSpentMs` recorded) and
 * goes to UF-09.6 for item 0, with no time check. From an item's step it marks the item skipped
 * and goes through `betweenItems`, so the store runs the check point for the item after it. The
 * plan and the logged sets are unchanged (a recorded set on UF-09.4 stands).
 */
function skipItem(state: FocusState, ctx: FocusCtx, atMs: number): FocusState {
  if (!canSkipItem(state, ctx) || state.pausedAtMs === null) return state;
  const pausedFor = Math.max(0, atMs - state.pausedAtMs);
  const resumed: FocusState = {
    ...state,
    resumePhase: null,
    pausedAtMs: null,
    workoutPausedMs: state.workoutPausedMs + pausedFor,
  };
  const from = state.resumePhase;
  if (from === "getReady" || from === "warmup") {
    const startedAt =
      from === "warmup" && state.warmupStartedAtMs !== null
        ? state.warmupStartedAtMs + pausedFor
        : null;
    return {
      ...resumed,
      phase: "next",
      itemIndex: 0,
      setIndex: 0,
      warmupStartedAtMs: null,
      warmupSpentMs: startedAt === null ? 0 : Math.max(0, atMs - startedAt),
      timer: timerAt(atMs, NEXT_SETUP_S),
    };
  }
  const skipped = state.skippedItems ?? [];
  return {
    ...resumed,
    phase: "betweenItems",
    timer: null,
    skippedItems: skipped.includes(state.itemIndex) ? skipped : [...skipped, state.itemIndex],
  };
}

/**
 * RESUME onto `set`/`timed` whose current set was logged while paused (T-0304b rework): Done set's
 * write landed after Pause, so the hook dispatched SET_LOGGED, not SET_RECORDED. The walk goes
 * where that record would have gone, timed from the resume: `confirm` (with the auto-save, or
 * none for "ask") after a reps set, `rest`/`done` after a timed one. Otherwise `state` as is.
 * The entry must be of the current item's exercise (T-0410): after a swap while paused, a set of
 * the old exercise at the same position is not the set on screen.
 */
function movedOnIfLogged(state: FocusState, ctx: FocusCtx, atMs: number): FocusState {
  if (state.phase !== "set" && state.phase !== "timed") return state;
  const exerciseId = ctx.plan.items[state.itemIndex]?.exerciseId;
  let entry: LoggedSet | undefined;
  for (const s of state.loggedSets) {
    const here = s.itemIndex === state.itemIndex && s.setIndex === state.setIndex;
    if (here && s.exerciseId === exerciseId) entry = s;
  }
  if (!entry) return state;
  if (state.phase === "timed") return afterSet(state, ctx, atMs);
  return { ...state, phase: "confirm", timer: autosaveTimer(entry, ctx, atMs) };
}

/**
 * After `replaceItem` on the current item: the set phase follows the new item (`timed` when its
 * `repsMin` is null), and `setIndex` stays, kept inside the new item's set count.
 *
 * D-0140 (T-0414): while the set step is in play (`set`/`timed`, or paused on one), the current
 * set never lands on a position that already holds a logged set (of any exercise). A taken
 * clamped position moves to the first free one; with none left, the swap ends the item as its
 * last set's save would: `rest` by the new exercise's `type` (from the pause when paused), or
 * `done` after the last item, which also ends a pause. Other phases are clamped only.
 */
function planReplaced(
  state: FocusState,
  ctx: FocusCtx,
  itemIndex: number,
  atMs: number,
): FocusState {
  if (itemIndex !== state.itemIndex) return state;
  const item = ctx.plan.items[itemIndex];
  if (!item) return state;
  const entry: Phase = item.repsMin === null ? "timed" : "set";
  const fix = (p: Phase): Phase => (p === "set" || p === "timed" ? entry : p);
  const was = state.phase === "paused" ? state.resumePhase : state.phase;
  let setIndex = Math.max(0, Math.min(state.setIndex, setsInItem(item) - 1));
  if ((was === "set" || was === "timed") && loggedIndexes(state, itemIndex).has(setIndex)) {
    const free = firstUnloggedSet(state, ctx, itemIndex);
    if (free === null) return endedBySwap(state, ctx, item, atMs);
    setIndex = free;
  }
  const phase = fix(state.phase);
  const resumePhase = state.resumePhase === null ? null : fix(state.resumePhase);
  if (phase === state.phase && resumePhase === state.resumePhase && setIndex === state.setIndex) {
    return state;
  }
  // The set step becoming a timed one starts its timer (D-0119 §1); a timed one becoming a reps
  // set has none. While paused, the new timer starts at the pause, so RESUME starts it running.
  const now = phase === "paused" ? resumePhase : phase;
  let timer = state.timer;
  if (was === "set" && now === "timed") {
    timer = timedTimer(
      ctx,
      itemIndex,
      state.phase === "paused" ? (state.pausedAtMs ?? atMs) : atMs,
    );
  } else if (was === "timed" && now === "set") timer = null;
  return { ...state, phase, resumePhase, setIndex, timer };
}

/** D-0140 §4: every position of the swapped-in item is logged, so the swap ends the item. */
function endedBySwap(
  state: FocusState,
  ctx: FocusCtx,
  item: SessionPlan["items"][number],
  atMs: number,
): FocusState {
  const setIndex = setsInItem(item) - 1;
  const pausedAtMs = state.phase === "paused" ? state.pausedAtMs : null;
  if (state.itemIndex + 1 >= ctx.plan.items.length) {
    if (pausedAtMs === null) return { ...state, phase: "done", setIndex, timer: null };
    // `done` can't wait behind the pause (persist.ts rejects `resumePhase: "done"`): it ends here.
    return {
      ...state,
      phase: "done",
      setIndex,
      timer: null,
      resumePhase: null,
      pausedAtMs: null,
      workoutPausedMs: state.workoutPausedMs + Math.max(0, atMs - pausedAtMs),
    };
  }
  const restS = restFor(item.exerciseId, ctx.library);
  if (pausedAtMs === null)
    return { ...state, phase: "rest", setIndex, timer: timerAt(atMs, restS) };
  // Paused: the rest starts at the pause, so RESUME leaves the full rest.
  return { ...state, resumePhase: "rest", setIndex, timer: timerAt(pausedAtMs, restS) };
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
    timer: entry === "timed" ? timedTimer(ctx, target.itemIndex, atMs) : null,
  };
}
