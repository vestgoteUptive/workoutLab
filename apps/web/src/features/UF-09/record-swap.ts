// T-1004 UF-09.9 (D-0277, D-0281): a swap confirmed in a workout is counted in the on-device edit
// ledger. No UI, no await on the caller's path, no network: the ledger writes to IndexedDB and
// T-1008 syncs later. `recordSwap` itself drops the reasons that are about today (equipment_taken,
// variety, short_on_time), a learning-off profile and a repeat of the pair in the same workout.
import type { SessionPlan, SwapReason } from "@workoutlab/shared";
import { recordSwap } from "../../lib/offline/edit-ledger.js";

type WorkoutItem = SessionPlan["items"][number];

/** The reason the sheet applied: the engine writes it into the new item's `swap` reason. */
export function swapReasonOf(item: WorkoutItem): SwapReason | null {
  for (const r of item.reasons) if (r.code === "swap") return r.reason;
  return null;
}

/** Fire and forget. Never throws and never rejects, so logging a set is never held up. */
export function recordInWorkoutSwap(
  from: string | undefined,
  item: WorkoutItem,
  workoutId: string,
): void {
  if (from === undefined) return;
  try {
    void recordSwap(from, item.exerciseId, swapReasonOf(item), workoutId, new Date()).catch(
      () => undefined,
    );
  } catch {
    // Counting must never break a swap.
  }
}
