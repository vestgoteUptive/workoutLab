// UF-09 session loading and restore (T-0304a, D-0066 §2, D-0111 §3 §7 §11, D-0138). IndexedDB only:
// the session row and the cached library. No network and no `refresh*` call, so online and
// offline behave the same and nothing re-times a step mid-workout (D-0111 §11).
import { parseSessionPlan } from "@workoutlab/shared";
import {
  currentUserId,
  loadLibrary,
  offlineDb,
  type SessionInsert,
} from "../../lib/offline/index.js";
import { initialFocusState, type FocusCtx } from "./machine.js";
import {
  defaultStorage,
  readFocusState,
  removeFocusState,
  writeFocusState,
  type FocusStorage,
} from "./persist.js";
import { createFocusStore, type FocusStore, type ResolveCheckPoint } from "./store.js";

/** An unfinished session started longer ago than this is stale, not live (D-0111 §7). */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type HostLoad =
  | { kind: "loading" }
  | { kind: "notOnDevice" }
  /** The user's own row is on the device, but its plan fails `parseSessionPlan` (D-0138). */
  | { kind: "unreadable" }
  | { kind: "ended" }
  | { kind: "stale"; startedAt: string }
  | {
      kind: "ready";
      store: FocusStore;
      ctx: FocusCtx;
      startedAtMs: number;
      warmupInBudget: boolean;
      /** The stored session row as loaded (T-0304e: `useFocusSession().row`). */
      row: SessionInsert;
      storage: FocusStorage | null;
    };

export async function loadSession(
  sessionId: string,
  resolveCheckPoint: ResolveCheckPoint,
  storage: FocusStorage | null = defaultStorage(),
): Promise<HostLoad> {
  try {
    const entry = await offlineDb().sessions.get(sessionId);
    if (!entry || entry.userId !== currentUserId()) return { kind: "notOnDevice" };
    const parsed = parseSessionPlan(entry.row.plan ?? null);
    // D-0138 §1 §5 §6: checked before ended and stale. The log carries the session id and the
    // parser's error only: never the plan's contents, never the user id. `warn`, not `error`.
    if (!parsed.ok) {
      console.warn(
        `[workoutLab] UF-09: stored plan for session ${sessionId} failed parseSessionPlan (${parsed.error})`,
      );
      return { kind: "unreadable" };
    }
    if (parsed.plan === null) return { kind: "notOnDevice" };
    const plan = parsed.plan;

    if (entry.row.ended_at != null) {
      removeFocusState(storage, sessionId);
      return { kind: "ended" };
    }
    const startedAtMs = Date.parse(entry.row.started_at);
    if (Number.isFinite(startedAtMs) && Date.now() - startedAtMs > STALE_AFTER_MS) {
      // The stored focus state is kept: nothing the user did is lost (D-0111 §7).
      return { kind: "stale", startedAt: entry.row.started_at };
    }

    let library: FocusCtx["library"] = [];
    try {
      library = await loadLibrary();
    } catch {
      // No cached library: rests fall back to the compound length (D-0111 §4).
    }
    const ctx: FocusCtx = { plan, library };
    const stored = readFocusState(sessionId, ctx, storage);
    const initial = stored ?? initialFocusState(sessionId, plan, Date.now());
    if (!stored) writeFocusState(storage, sessionId, initial);
    const store = createFocusStore({ sessionId, ctx, initial, storage, resolveCheckPoint });
    return {
      kind: "ready",
      store,
      ctx,
      startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
      warmupInBudget: entry.row.warmup_in_budget ?? true,
      row: entry.row,
      storage,
    };
  } catch {
    // IndexedDB unavailable, or the read rejected: never an uncaught error (D-0111 §7).
    return { kind: "notOnDevice" };
  }
}
