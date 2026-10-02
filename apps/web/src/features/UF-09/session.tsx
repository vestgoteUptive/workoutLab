// UF-09 focus-session seam (T-0304e, D-0066 §12, D-0071 §5 §6). The one way a view or a seam
// overlay reads and writes the running session. Every write goes through `lib/offline` (the
// IndexedDB queue, NFR-OFF-2), and the machine moves only after that write has resolved.
// Every `upsertSession` sends the whole stored row (D-0071 §6), never a partial one.
import { createContext, useContext } from "react";
import { WARMUP_COST_S, availableS } from "@workoutlab/engine";
import type { Energy, SessionPlan, Workout, WorkoutItem } from "@workoutlab/shared";
import {
  deleteSet as queueDeleteSet,
  editSet as queueEditSet,
  offlineDb,
  recordSet as queueRecordSet,
  upsertSession,
  type RecordSetInput,
  type SessionInsert,
  type SetEdit,
} from "../../lib/offline/index.js";
import { firstUnloggedSet, setsInItem, type FocusState, type LoggedSet } from "./machine.js";
import { removeFocusState, type FocusStorage } from "./persist.js";
import type { FocusStore } from "./store.js";
import { elapsedS as elapsedSOf, remainingS } from "./timer.js";

/** The stored `sessions` row (`(await offlineDb().sessions.get(id)).row`). */
export type SessionRow = SessionInsert;

/** `recordSet`'s input: the `lib/offline` input plus the plan item the set belongs to. */
export type FocusSetInput = RecordSetInput & { itemIndex: number };

/**
 * The value of `useFocusSession()` (D-0066 §12, D-0071 §5). A seam overlay gets the same value
 * as its `render(ctx)` argument.
 */
export interface FocusSession {
  /** The `sessions.id` in the route. */
  sessionId: string;
  /** The stored session row, updated after `replaceItem` and `finish` write it. */
  row: SessionRow;
  /** The plan being walked (`row.plan`, parsed); changes only through `replaceItem`. */
  plan: SessionPlan;
  /** The D-0069 §5 `Workout` built from `row` and `plan` (the `api/openapi.yaml` shape). */
  workout: Workout;
  /** The focus machine state (D-0111 §4), as persisted to `wl-focus:<sessionId>`. */
  state: FocusState;
  /** `state.itemIndex`. */
  currentItemIndex: number;
  /** The set on screen or up next, 0-based (the back-off set is `item.sets`): `state.setIndex`,
   *  except in `rest`, where the set just done is behind and this is the one the rest leads to
   *  (the item's first unlogged set after it, or its set count when none is left). */
  currentSetIndex: number;
  /** The live logged sets of this session, in log order. */
  loggedSets: readonly LoggedSet[];
  /** The running rest (`remainingS` from the wall clock), or `null` outside `rest`. */
  rest: { remainingS: number } | null;
  /** Rule 8's elapsed seconds (D-0066 §11): pauses and an off-budget warm-up excluded. */
  elapsedS: number;
  /** Logs a set through `lib/offline` `recordSet`, then adds it to `loggedSets`. The current
   *  set in `set`/`timed` moves the machine (`SET_RECORDED`/`TIMED_RECORDED`); any other set is
   *  a List-view log and moves nothing. Rejects, with no change, when the write rejects. */
  recordSet(input: FocusSetInput): Promise<LoggedSet>;
  /** `lib/offline` `editSet`, then updates that entry. */
  editSet(clientId: string, patch: SetEdit): Promise<void>;
  /** `lib/offline` `deleteSet` (a tombstone), then removes that entry. */
  deleteSet(clientId: string): Promise<void>;
  /** Replaces item `index` (the current one or a later one, else `RangeError`) and writes
   *  `{...row, plan}`. `mainLiftId`, when given, becomes `plan.mainLiftId`. Logged sets keep
   *  their `exerciseId`. */
  replaceItem(index: number, item: WorkoutItem, mainLiftId?: string | null): Promise<void>;
  /** Writes `{...row, ended_at: now}`, removes `wl-focus:<id>`, then navigates to
   *  `/session/<id>/summary`. No UI and no confirm; one write while pending. */
  finish(): Promise<void>;
  /** Starts a wall-clock rest for `exerciseId` (`REST_COMPOUND_S` / `REST_ISOLATION_S`). */
  startRest(exerciseId: string): void;
  /** Moves the running rest by `deltaS` seconds, floored at 0, with no cap. */
  adjustRest(deltaS: number): void;
  /** Ends the running rest now. */
  skipRest(): void;
  /** Resumes a paused workout. */
  resume(): void;
  /** Closes the open seam overlay (D-0071 §4); a no-op when none is open. */
  close(): void;
}

export const FocusSessionContext = createContext<FocusSession | null>(null);

/** The running focus session. Only inside `<SessionHost>`, once the session has loaded. */
export function useFocusSession(): FocusSession {
  const session = useContext(FocusSessionContext);
  if (!session) throw new Error("useFocusSession() must be used inside <SessionHost>");
  return session;
}

const ENERGIES: readonly Energy[] = ["low", "normal", "high"];

/** D-0069 §5 / D-0066 §11: the `Workout` from the session row; the engine's `availableS`. */
export function buildWorkout(row: SessionRow, plan: SessionPlan): Workout {
  const budgetMin = row.time_budget_min;
  const warmupInBudget = row.warmup_in_budget ?? true;
  const itemsTotalS = plan.items.reduce((sum, item) => sum + item.costS, 0);
  const energy = ENERGIES.find((e) => e === row.energy) ?? "normal";
  return {
    plan,
    budgetMin,
    warmupInBudget,
    energy,
    itemsTotalS,
    totalS: itemsTotalS + WARMUP_COST_S,
    unusedS: Math.max(0, availableS(budgetMin, warmupInBudget) - itemsTotalS),
    sessionReasons: [],
  };
}

export type FocusActions = Omit<
  FocusSession,
  | "sessionId"
  | "row"
  | "plan"
  | "workout"
  | "state"
  | "currentItemIndex"
  | "currentSetIndex"
  | "loggedSets"
  | "rest"
  | "elapsedS"
  | "close"
>;

export interface FocusActionDeps {
  sessionId: string;
  store: FocusStore;
  storage: FocusStorage | null;
  onRow(row: SessionRow): void;
  navigate(to: string): void;
}

async function storedRow(sessionId: string): Promise<SessionRow> {
  const entry = await offlineDb().sessions.get(sessionId);
  if (!entry) throw new Error(`session ${sessionId} isn't on this device`);
  return entry.row;
}

/** The write methods and helpers, created once per loaded session. */
export function createFocusActions(deps: FocusActionDeps): FocusActions {
  const { sessionId, store, storage } = deps;
  let finishing: Promise<void> | null = null;

  return {
    async recordSet(input) {
      const queued = await queueRecordSet(input);
      const set: LoggedSet = {
        clientId: queued.clientId,
        itemIndex: input.itemIndex,
        setIndex: input.setIndex,
        exerciseId: queued.exerciseId,
        reps: queued.reps,
        weightKg: queued.weightKg,
        durationS: queued.durationS,
        rir: queued.rir,
        backoff: queued.backoff,
      };
      const state = store.getState();
      const atMs = Date.now();
      const current = input.itemIndex === state.itemIndex && input.setIndex === state.setIndex;
      if (current && state.phase === "set") store.dispatch({ type: "SET_RECORDED", set, atMs });
      else if (current && state.phase === "timed") {
        store.dispatch({ type: "TIMED_RECORDED", set, atMs });
      } else store.dispatch({ type: "SET_LOGGED", set, atMs });
      return store.getState().loggedSets.find((s) => s.clientId === set.clientId) ?? set;
    },

    async editSet(clientId, patch) {
      const queued = await queueEditSet(clientId, patch);
      const prev = store.getState().loggedSets.find((s) => s.clientId === clientId);
      if (!prev) return;
      store.dispatch({
        type: "SET_EDITED",
        set: {
          ...prev,
          exerciseId: queued.exerciseId,
          setIndex: patch.setIndex ?? prev.setIndex,
          backoff: patch.backoff ?? prev.backoff,
          reps: queued.reps,
          weightKg: queued.weightKg,
          durationS: queued.durationS,
          rir: queued.rir,
        },
        atMs: Date.now(),
      });
    },

    async deleteSet(clientId) {
      await queueDeleteSet(clientId);
      store.dispatch({ type: "SET_DELETED", clientId, atMs: Date.now() });
    },

    async replaceItem(index, item, mainLiftId) {
      const { plan } = store.getSnapshot().ctx;
      const { itemIndex } = store.getState();
      if (!Number.isInteger(index) || index < itemIndex || index >= plan.items.length) {
        throw new RangeError(
          `replaceItem: item ${index} is not the current item (${itemIndex}) or a later one`,
        );
      }
      const row = await storedRow(sessionId);
      const items = plan.items.map((it, k) => (k === index ? item : it));
      const next: SessionPlan =
        mainLiftId === undefined ? { ...plan, items } : { ...plan, items, mainLiftId };
      const written: SessionRow = { ...row, plan: next };
      await upsertSession(written);
      store.replacePlan(next, index, Date.now());
      deps.onRow(written);
    },

    finish() {
      if (finishing) return finishing;
      const run = (async () => {
        const row = await storedRow(sessionId);
        const written: SessionRow = { ...row, ended_at: new Date(Date.now()).toISOString() };
        await upsertSession(written);
        removeFocusState(storage, sessionId);
        deps.onRow(written);
        deps.navigate(`/session/${sessionId}/summary`);
      })();
      finishing = run;
      // A failed finish can be tried again; a pending or finished one is never written twice.
      run.catch(() => {
        if (finishing === run) finishing = null;
      });
      return run;
    },

    startRest(exerciseId) {
      store.dispatch({ type: "REST_START", exerciseId, atMs: Date.now() });
    },
    adjustRest(deltaS) {
      store.dispatch({ type: "REST_ADJUST", deltaS, atMs: Date.now() });
    },
    skipRest() {
      store.dispatch({ type: "REST_END", atMs: Date.now() });
    },
    resume() {
      store.dispatch({ type: "RESUME", atMs: Date.now() });
    },
  };
}

function currentSetIndex(state: FocusState, plan: SessionPlan): number {
  if (state.phase !== "rest") return state.setIndex;
  const item = plan.items[state.itemIndex];
  if (!item) return state.setIndex;
  const ctx = { plan, library: [] };
  return firstUnloggedSet(state, ctx, state.itemIndex, state.setIndex) ?? setsInItem(item);
}

export interface FocusReadInput {
  sessionId: string;
  row: SessionRow;
  plan: SessionPlan;
  workout: Workout;
  state: FocusState;
  nowMs: number;
}

/** The read fields of `useFocusSession()` for `state` at `nowMs`. */
export function focusReadFields(input: FocusReadInput) {
  const { sessionId, row, plan, workout, state, nowMs } = input;
  const startedAtMs = Date.parse(row.started_at);
  return {
    sessionId,
    row,
    plan,
    workout,
    state,
    currentItemIndex: state.itemIndex,
    currentSetIndex: currentSetIndex(state, plan),
    loggedSets: state.loggedSets,
    rest:
      state.phase === "rest" && state.timer ? { remainingS: remainingS(state.timer, nowMs) } : null,
    elapsedS: elapsedSOf(
      {
        startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : nowMs,
        workoutPausedMs: state.workoutPausedMs,
        pausedAtMs: state.pausedAtMs,
        warmupSpentMs: state.warmupSpentMs,
        warmupInBudget: row.warmup_in_budget ?? true,
      },
      nowMs,
    ),
  };
}
