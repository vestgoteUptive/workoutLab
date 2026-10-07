// The shared workout formatters (D-0071 §1, D-0106 §3–§5). Created by T-0302c (UF-02.1); UF-02.2,
// UF-08.2 and UF-09 import them read-only, and T-0303b may add keys. Every string here is a literal
// in this file, except the area names, which come from `en.bodyMap.areas` (no second copy).
//
// Principle 3: these only put words on the engine's output (`WorkoutItem`, `Reason`). They never
// choose, order or count anything the engine didn't.
import type { Area, Reason, WorkoutItem } from "@workoutlab/shared";
import { en } from "./en.js";

/** How many reason lines an item shows (D-0106 §4). */
const ITEM_REASONS = 2;
/** How many session chips show (D-0106 §4). */
const SESSION_CHIPS = 3;

/** The display name of a body area, from the one catalogue copy. */
export function areaName(area: Area): string {
  return en.bodyMap.areas[area];
}

/** "4 × 6–8", "4 × 5", "3 × 45 s": sets, then the rep range or the planned hold. */
export function itemSummary(
  item: Pick<WorkoutItem, "sets" | "repsMin" | "repsMax" | "durationS">,
): string {
  const { sets, repsMin, repsMax, durationS } = item;
  if (repsMin !== null) {
    const reps = repsMax === null || repsMax === repsMin ? `${repsMin}` : `${repsMin}–${repsMax}`;
    return `${sets} × ${reps}`;
  }
  if (durationS !== null) return `${sets} × ${durationS} s`;
  return `${sets} sets`;
}

/** A rest length as "m:ss": 120 → "2:00", 90 → "1:30". */
export function restLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest}`;
}

/** A 0–1 share as a whole percent, rounded half up (0.625 → 63). */
function percent(share: number): number {
  // toFixed first, so 0.145 × 100 = 14.499… still rounds to 15.
  return Math.floor(Number((share * 100).toFixed(6)) + 0.5);
}

function daysAgo(days: number): string {
  if (days === 0) return "last trained today";
  if (days === 1) return "last trained 1 day ago";
  return `last trained ${days} days ago`;
}

/** One reason → one line. `prefill` has no line (""). */
export function reasonLine(reason: Reason): string {
  switch (reason.code) {
    case "main_lift":
      return "Main lift";
    case "area_deficit":
      return `${areaName(reason.area)} ${percent(reason.deficit)} % below target`;
    case "days_since":
      return reason.days === null
        ? `${areaName(reason.area)} not trained yet`
        : `${areaName(reason.area)} ${daysAgo(reason.days)}`;
    case "recovering_skipped":
      return `${areaName(reason.area)} recovering, skipped`;
    case "energy_low_trim":
      return "Trimmed for low energy";
    case "energy_high_backoff":
      return "Back-off set added";
    case "swap":
      switch (reason.reason) {
        case null:
          return "Swapped";
        case "equipment_taken":
          return "Swapped: equipment taken";
        case "discomfort":
          return "Swapped for comfort";
        case "variety":
          return "Swapped for variety";
        case "short_on_time":
          return "Swapped to save time";
      }
      return "Swapped";
    case "prefill":
      return "";
  }
}

/**
 * An item's reasons as one line: the non-empty lines in order, at most 2, " · "-joined. A `swap`
 * line (the first non-empty one) leads, so a swap is visible inside the cap (D-0197 §1).
 */
export function itemReasonLine(reasons: readonly Reason[]): string {
  const swap = reasons.find((r) => r.code === "swap" && reasonLine(r) !== "");
  const ordered = swap ? [swap, ...reasons.filter((r) => r !== swap)] : reasons;
  return ordered
    .map(reasonLine)
    .filter((line) => line !== "")
    .slice(0, ITEM_REASONS)
    .join(" · ");
}

/**
 * The session chips (D-0106 §4): at most 3, in order, empties skipped. An `area_deficit` chip is
 * the bare area name; `recovering_skipped` keeps its full line, so it never reads as trained.
 */
export function sessionReasonChips(reasons: readonly Reason[]): string[] {
  return reasons
    .map((reason) => (reason.code === "area_deficit" ? areaName(reason.area) : reasonLine(reason)))
    .filter((chip) => chip !== "")
    .slice(0, SESSION_CHIPS);
}
