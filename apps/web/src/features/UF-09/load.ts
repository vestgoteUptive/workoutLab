// UF-09 session loading and restore (T-0304a, D-0066 §2, D-0111 §3 §7 §11). IndexedDB only:
// the session row and the cached library. No network and no `refresh*` call, so online and
// offline behave the same and nothing re-times a step mid-workout (D-0111 §11).
import { parseSessionPlan } from "@workoutlab/shared";
import { currentUserId, loadLibrary, offlineDb } from "../../lib/offline/index.js";
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
  | { kind: "ended" }
  | { kind: "stale"; startedAt: string }
  | {
      kind: "ready";
      store: FocusStore;
      ctx: FocusCtx;
      startedAtMs: number;
      warmupInBudget: boolean;
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
    if (!parsed.ok || parsed.plan === null) return { kind: "notOnDevice" };
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
    };
  } catch {
    // IndexedDB unavailable, or the read rejected: never an uncaught error (D-0111 §7).
    return { kind: "notOnDevice" };
  }
}
