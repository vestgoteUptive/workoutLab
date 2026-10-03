// The Today "Resume workout" card's data (T-0395, D-0139 §2). The newest unfinished, non-stale
// session of the signed-in user that has a focus state on this device. IndexedDB and
// `localStorage` only (D-0139 §5): no network, so it reads the same online and offline, and it
// never throws — an IndexedDB or storage failure is a `null` result, never a broken caller.
import { parseSessionPlan } from "@workoutlab/shared";
import { currentUserId, offlineDb } from "../../lib/offline/index.js";
import { STALE_AFTER_MS } from "./load.js";
import { setsInItem } from "./machine.js";
import { defaultStorage, focusKey, type FocusStorage } from "./persist.js";

export interface Resumable {
  sessionId: string;
  startedAt: string;
  done: number;
  total: number;
}

/** The `loggedSets` count of a stored `wl-focus:<id>` value: 0 when it isn't JSON, or its
 *  `loggedSets` isn't an array (D-0139 §3). */
function loggedCount(raw: string | null): number {
  if (raw === null) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (typeof parsed !== "object" || parsed === null) return 0;
  const loggedSets = (parsed as { loggedSets?: unknown }).loggedSets;
  return Array.isArray(loggedSets) ? loggedSets.length : 0;
}

/** The newest resumable session for the signed-in user, or `null` (D-0139 §2). Never throws: any
 *  IndexedDB or storage failure resolves `null`, same as no resumable session. */
export async function findResumable(
  now: Date,
  storage: FocusStorage | null = defaultStorage(),
): Promise<Resumable | null> {
  try {
    const userId = currentUserId();
    if (!userId) return null;
    const rows = await offlineDb().sessions.where("userId").equals(userId).toArray();
    const nowMs = now.getTime();
    let best: { id: string; startedAtMs: number; startedAt: string; total: number } | null = null;
    for (const entry of rows) {
      const row = entry.row;
      if (row.ended_at != null) continue;
      const startedAtMs = Date.parse(row.started_at);
      if (!Number.isFinite(startedAtMs) || nowMs - startedAtMs > STALE_AFTER_MS) continue;
      const parsed = parseSessionPlan(row.plan ?? null);
      if (!parsed.ok || parsed.plan === null) continue;
      let hasFocusState: string | null;
      try {
        hasFocusState = storage?.getItem(focusKey(entry.id)) ?? null;
      } catch {
        hasFocusState = null;
      }
      if (hasFocusState === null) continue;
      const total = parsed.plan.items.reduce((sum, item) => sum + setsInItem(item), 0);
      if (
        !best ||
        startedAtMs > best.startedAtMs ||
        (startedAtMs === best.startedAtMs && entry.id < best.id)
      ) {
        best = { id: entry.id, startedAtMs, startedAt: row.started_at, total };
      }
    }
    if (!best) return null;
    let raw: string | null;
    try {
      raw = storage?.getItem(focusKey(best.id)) ?? null;
    } catch {
      raw = null;
    }
    return {
      sessionId: best.id,
      startedAt: best.startedAt,
      done: loggedCount(raw),
      total: best.total,
    };
  } catch {
    return null;
  }
}
