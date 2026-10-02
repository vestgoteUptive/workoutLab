// UF-09 wall-clock timer maths (T-0304a, NFR-TIME-1, D-0066 §1 §11). Every value is derived
// from timestamps and `now`; nothing is ever decremented, so locking the phone, a throttled
// background tab or a killed page never loses time.

/** A wall-clock timer: `remainingS` is derived from `now`, never decremented (NFR-TIME-1). */
export interface FocusTimer {
  startedAtMs: number;
  durationS: number;
  pausedMs: number;
}

/** `max(0, durationS − floor((now − startedAtMs − pausedMs) / 1000))` (D-0066 §1). */
export function remainingS(timer: FocusTimer, nowMs: number): number {
  const runMs = Math.max(0, nowMs - timer.startedAtMs - timer.pausedMs);
  return Math.max(0, timer.durationS - Math.floor(runMs / 1000));
}

export interface ElapsedInput {
  /** `sessions.started_at` in ms. */
  startedAtMs: number;
  /** The pauses already ended (`FocusState.workoutPausedMs`). */
  workoutPausedMs: number;
  /** Set while paused: the running pause isn't counted, so elapsed stands still. */
  pausedAtMs: number | null;
  warmupSpentMs: number;
  warmupInBudget: boolean;
}

/** Rule 8's `elapsedS` (D-0066 §11): wall time since start, minus pauses, minus an off-budget
 *  warm-up. While paused it doesn't grow. */
export function elapsedS(input: ElapsedInput, nowMs: number): number {
  const at = input.pausedAtMs ?? nowMs;
  const warmupMs = input.warmupInBudget ? 0 : input.warmupSpentMs;
  const ms = at - input.startedAtMs - input.workoutPausedMs - warmupMs;
  return Math.max(0, Math.floor(ms / 1000));
}

/** `m:ss`, e.g. `0:30`, `2:00`. */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}
