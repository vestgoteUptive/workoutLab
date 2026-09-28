// The D-0045 §6 monotonic edit clock: `edited_at = max(now, previous edited_at + 1 ms)`.
export function monotonicEditedAt(now: Date, previousEditedAt: string | null): string {
  const nowMs = now.getTime();
  const prevMs = previousEditedAt ? new Date(previousEditedAt).getTime() + 1 : -Infinity;
  return new Date(Math.max(nowMs, prevMs)).toISOString();
}
