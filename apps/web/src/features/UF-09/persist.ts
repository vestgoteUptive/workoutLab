// UF-09 persisted focus state (T-0304a, NFR-OFF-2, D-0066 §2, D-0111 §6 §7). Device-local
// `localStorage`, one key per session. Reads validate against the current plan; anything that
// doesn't fit is removed, so the machine starts fresh instead of rendering a broken step.
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
): void {
  try {
    storage?.setItem(focusKey(sessionId), JSON.stringify(state));
  } catch {
    // Quota or private mode: the transition still happens.
  }
}

export function removeFocusState(storage: FocusStorage | null, sessionId: string): void {
  try {
    storage?.removeItem(focusKey(sessionId));
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
  if (!isInt(s.itemIndex) || s.itemIndex < 0 || s.itemIndex >= Math.max(1, items.length)) {
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
  return Array.isArray(s.loggedSets);
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
    return { ...parsed, timerPausedAtMs: parsed.timerPausedAtMs ?? null };
  }
  removeFocusState(storage, sessionId);
  return null;
}
