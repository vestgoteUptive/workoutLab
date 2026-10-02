// UF-09 focus store (T-0304a, D-0111 §5 §6). It lives outside React so the write is
// synchronous: `dispatch` runs the reducer, writes `localStorage`, and only then notifies.
// When `dispatch` returns, the step is on disk — a kill between paint and an effect can't lose
// it (NFR-OFF-2). The host reads it with `useSyncExternalStore`.
import type { SessionPlan } from "@workoutlab/shared";
import { focusReducer, type FocusCtx, type FocusEvent, type FocusState } from "./machine.js";
import { writeFocusState, type FocusStorage } from "./persist.js";

/** Decides the check point after an item (D-0111 §5). T-0304d plugs in rule 8. */
export type ResolveCheckPoint = (
  state: FocusState,
  ctx: FocusCtx,
  atMs: number,
) => "next" | "timeCheck";

export const defaultResolveCheckPoint: ResolveCheckPoint = () => "next";

/** The state and the plan it walks, as one snapshot: a new object whenever either changes. */
export interface FocusSnapshot {
  state: FocusState;
  ctx: FocusCtx;
}

export interface FocusStore {
  getState(): FocusState;
  /** For `useSyncExternalStore`: changes when the state or the plan changes (T-0304e). */
  getSnapshot(): FocusSnapshot;
  dispatch(event: FocusEvent): void;
  /** `replaceItem` after its write (T-0304e, D-0071 §5): the store walks `plan` from now on, and
   *  `PLAN_REPLACED` realigns the current step with the new item. */
  replacePlan(plan: SessionPlan, itemIndex: number, atMs: number): void;
  /** A UF-09.8 option after its write (T-0304d, D-0120 §1): the store walks `plan` (the engine's
   *  whole item list) from now on, and `PLAN_APPLIED` moves on to UF-09.6, or to `done`. */
  applyPlan(plan: SessionPlan, atMs: number): void;
  subscribe(listener: () => void): () => void;
}

export interface FocusStoreOptions {
  sessionId: string;
  ctx: FocusCtx;
  initial: FocusState;
  storage: FocusStorage | null;
  resolveCheckPoint?: ResolveCheckPoint;
}

export function createFocusStore(options: FocusStoreOptions): FocusStore {
  const { sessionId, storage } = options;
  const resolveCheckPoint = options.resolveCheckPoint ?? defaultResolveCheckPoint;
  let ctx = options.ctx;
  let state = options.initial;
  let snapshot: FocusSnapshot = { state, ctx };
  const listeners = new Set<() => void>();
  const notify = () => {
    snapshot = { state, ctx };
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => state,
    getSnapshot: () => snapshot,
    replacePlan(plan, itemIndex, atMs) {
      ctx = { ...ctx, plan };
      const next = focusReducer(state, { type: "PLAN_REPLACED", itemIndex, atMs }, ctx);
      if (next !== state) {
        state = next;
        writeFocusState(storage, sessionId, state);
      }
      notify();
    },
    applyPlan(plan, atMs) {
      ctx = { ...ctx, plan };
      const next = focusReducer(state, { type: "PLAN_APPLIED", atMs }, ctx);
      if (next !== state) {
        state = next;
        writeFocusState(storage, sessionId, state);
      }
      notify();
    },
    dispatch(event) {
      let next = focusReducer(state, event, ctx);
      if (next === state) return;
      if (next.phase === "betweenItems") {
        let to: "next" | "timeCheck" = "next";
        try {
          to = resolveCheckPoint(next, ctx, event.atMs) === "timeCheck" ? "timeCheck" : "next";
        } catch {
          // A failing check never blocks the workout: go on to the next exercise.
        }
        next = focusReducer(next, { type: "CHECK_RESOLVED", to, atMs: event.atMs }, ctx);
      }
      state = next;
      writeFocusState(storage, sessionId, state);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
