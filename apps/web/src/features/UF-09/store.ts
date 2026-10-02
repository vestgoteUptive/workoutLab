// UF-09 focus store (T-0304a, D-0111 §5 §6). It lives outside React so the write is
// synchronous: `dispatch` runs the reducer, writes `localStorage`, and only then notifies.
// When `dispatch` returns, the step is on disk — a kill between paint and an effect can't lose
// it (NFR-OFF-2). The host reads it with `useSyncExternalStore`.
import { focusReducer, type FocusCtx, type FocusEvent, type FocusState } from "./machine.js";
import { writeFocusState, type FocusStorage } from "./persist.js";

/** Decides the check point after an item (D-0111 §5). T-0304d plugs in rule 8. */
export type ResolveCheckPoint = (
  state: FocusState,
  ctx: FocusCtx,
  atMs: number,
) => "next" | "timeCheck";

export const defaultResolveCheckPoint: ResolveCheckPoint = () => "next";

export interface FocusStore {
  getState(): FocusState;
  dispatch(event: FocusEvent): void;
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
  const { sessionId, ctx, storage } = options;
  const resolveCheckPoint = options.resolveCheckPoint ?? defaultResolveCheckPoint;
  let state = options.initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
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
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
