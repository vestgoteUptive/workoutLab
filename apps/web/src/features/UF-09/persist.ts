// UF-09 persisted focus state (T-0304a, NFR-OFF-2, D-0066 §2, D-0111 §6 §7). Device-local
// `localStorage`, one key per session. Reads validate against the current plan; anything that
// doesn't fit is removed, so the machine starts fresh instead of rendering a broken step.
import type { SessionPlan } from "@workoutlab/shared";
import {
  STORED_PHASES,
  setsInItem,
  type FocusCtx,
  type FocusState,
  type Phase,
} from "./machine.js";

export const FOCUS_KEY_PREFIX = "wl-focus:";

export function focusKey(sessionId: string): string {
  return `${FOCUS_KEY_PREFIX}${sessionId}`;
}

/** Where the skipped items' exercise ids are kept (T-0578), beside the focus state. */
function skippedKey(sessionId: string): string {
  return `wl-focus-skipped:${sessionId}`;
}

/** A storage that can fail: quota, private mode, a disabled `localStorage` getter. */
export type FocusStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's `localStorage`, or `null` where even reaching it throws. */
export function defaultStorage(): FocusStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Writes the state. Never throws: the workout never stops for storage (D-0111 §6). */
export function writeFocusState(
  storage: FocusStorage | null,
  sessionId: string,
  state: FocusState,
  plan?: SessionPlan,
): void {
  try {
    // T-0578: the skipped items' exercise ids ride along, so a restore against a plan reordered
    // after this write (a kill between the two) can realign `skippedItems` by exercise.
    // They live under their own key so the stored state stays exactly the machine state.
    if (plan && state.skippedItems.length > 0) {
      const ids = state.skippedItems.map((i) => plan.items[i]?.exerciseId ?? null);
      storage?.setItem(skippedKey(sessionId), JSON.stringify(ids));
    } else storage?.removeItem(skippedKey(sessionId));
    storage?.setItem(focusKey(sessionId), JSON.stringify(state));
  } catch {
    // Quota or private mode: the transition still happens.
  }
}

export function removeFocusState(storage: FocusStorage | null, sessionId: string): void {
  try {
    storage?.removeItem(focusKey(sessionId));
    storage?.removeItem(skippedKey(sessionId));
  } catch {
    // Nothing to do: a key we can't remove is one we couldn't read either.
  }
}

/** The phases whose timer ends them (D-0111 §8): they must carry a timer. T-0304c: `timed`
 *  ends by its position + hold timer (D-0119 §1), so a stored `timed` with no timer is invalid. */
const TIMER_PHASES: readonly Phase[] = ["getReady", "warmup", "rest", "next", "timed"];

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPhase = (v: unknown): v is Phase =>
  typeof v === "string" && (STORED_PHASES as readonly string[]).includes(v);

function validTimer(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return isNum(t.startedAtMs) && isNum(t.durationS) && isNum(t.pausedMs);
}

/** Whether `v` is a version-1 state for `sessionId` whose indexes fit the current plan. */
export function isValidFocusState(v: unknown, sessionId: string, ctx: FocusCtx): v is FocusState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  if (s.version !== 1 || s.sessionId !== sessionId || !isPhase(s.phase)) return false;
  const { items, warmup } = ctx.plan;
  // D-0120 §5: a time check (or a pause on one) may sit one past the last item: a kill between
  // the write that removed every remaining item and PLAN_APPLIED. It restores as `done`.
  const checkPastEnd = pastEndTimeCheck(s, items.length);
  const maxItem = checkPastEnd ? items.length + 1 : Math.max(1, items.length);
  if (!isInt(s.itemIndex) || s.itemIndex < 0 || s.itemIndex >= maxItem) {
    return false;
  }
  const item = items[s.itemIndex];
  const maxSets = item ? setsInItem(item) : 1;
  if (!isInt(s.setIndex) || s.setIndex < 0 || s.setIndex >= maxSets) return false;
  if (!isInt(s.warmupIndex) || s.warmupIndex < 0 || s.warmupIndex >= Math.max(1, warmup.length)) {
    return false;
  }
  if (!validTimer(s.timer)) return false;
  // A phase that ends by its timer can't be restored without one: it would never end.
  const runningPhase = s.phase === "paused" ? s.resumePhase : s.phase;
  if (isPhase(runningPhase) && TIMER_PHASES.includes(runningPhase) && s.timer === null) {
    return false;
  }
  if (s.pausedAtMs !== null && !isNum(s.pausedAtMs)) return false;
  if (s.phase === "paused") {
    if (!isPhase(s.resumePhase) || s.resumePhase === "paused" || s.resumePhase === "done") {
      return false;
    }
    if (!isNum(s.pausedAtMs)) return false;
  } else if (s.resumePhase !== null) return false;
  if (!isNum(s.workoutPausedMs) || !isNum(s.warmupSpentMs)) return false;
  if (s.warmupStartedAtMs !== null && !isNum(s.warmupStartedAtMs)) return false;
  // D-0119 §2: a state written before T-0304c has no `timerPausedAtMs` and reads as `null`.
  const ring = s.timerPausedAtMs;
  if (ring !== undefined && ring !== null && !isNum(ring)) return false;
  // D-0120 §7: a state written before T-0304d has no `skippedItems` and reads as `[]`.
  const skipped = s.skippedItems;
  if (skipped !== undefined) {
    if (!Array.isArray(skipped)) return false;
    if (!skipped.every((i) => isInt(i) && i >= 0 && i < items.length)) return false;
  }
  return Array.isArray(s.loggedSets);
}

/** A stored `timeCheck`, or a pause taken on one, whose `itemIndex` is the plan's length. */
function pastEndTimeCheck(s: Record<string, unknown>, length: number): boolean {
  const running = s.phase === "paused" ? s.resumePhase : s.phase;
  return running === "timeCheck" && s.itemIndex === length;
}

/**
 * The stored focus state for `sessionId` (D-0111 §7), or `null`. An unparsable, wrong-version,
 * unknown-phase or out-of-range value is removed, so the caller starts at UF-09.1.
 */
export function readFocusState(
  sessionId: string,
  ctx: FocusCtx,
  storage: FocusStorage | null = defaultStorage(),
): FocusState | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(focusKey(sessionId)) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (isValidFocusState(parsed, sessionId, ctx)) {
    let skippedIds: unknown = null;
    try {
      skippedIds = JSON.parse(storage?.getItem(skippedKey(sessionId)) ?? "null");
    } catch {
      skippedIds = null;
    }
    const rest = parsed;
    const items = ctx.plan.items;
    const realign = (index: number, exerciseId: unknown): number => {
      if (items[index]?.exerciseId === exerciseId) return index;
      const found = items.findIndex((it) => it.exerciseId === exerciseId);
      return found >= 0 ? found : index;
    };
    const skippedStored = (parsed.skippedItems as number[] | undefined) ?? [];
    const ids = Array.isArray(skippedIds) && skippedIds.length === skippedStored.length;
    const restored: FocusState = {
      ...rest,
      timerPausedAtMs: parsed.timerPausedAtMs ?? null,
      // T-0578: the plan may be reordered after this state was written; realign by exercise id.
      skippedItems: ids
        ? skippedStored.map((i, k) => realign(i, (skippedIds as unknown[])[k]))
        : skippedStored,
      loggedSets: (parsed.loggedSets as FocusState["loggedSets"]).map((s) =>
        typeof s === "object" && s !== null
          ? { ...s, itemIndex: realign(s.itemIndex, s.exerciseId) }
          : s,
      ),
    };
    if (!pastEndTimeCheck(restored as unknown as Record<string, unknown>, ctx.plan.items.length)) {
      return restored;
    }
    // D-0120 §5: nothing is left after the time check, so the workout is done (and finishes).
    return { ...restored, phase: "done", resumePhase: null, pausedAtMs: null, timer: null };
  }
  removeFocusState(storage, sessionId);
  return null;
}
