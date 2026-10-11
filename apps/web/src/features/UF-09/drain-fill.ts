// T-0596 (D-0211 §5, UF-09.2, UF-09.7): the deep fill of a warm-up move and a timed hold. The
// fill is `drainPercent(elapsed, total)` of the same wall-clock timers the views show (the host
// re-renders once a second, so it steps once a second); nothing here reads a clock.
import { useEffect, useRef, type CSSProperties } from "react";
import { drainPercent, drainStyle } from "../../components/drain/index.js";
import { holdSeconds, timedRemainingS } from "./machine.js";
import type { FocusCtx, FocusState } from "./machine.js";
import { remainingS } from "./timer.js";

/** The fill of the current screen, 0 to 100, or `null` for a view that has none. */
export function fillPercent(state: FocusState, ctx: FocusCtx, nowMs: number): number | null {
  if (state.phase === "warmup") {
    const total = state.timer?.durationS ?? ctx.plan.warmup[state.warmupIndex]?.durationS ?? 0;
    return drainPercent(state.timer ? total - remainingS(state.timer, nowMs) : 0, total);
  }
  if (state.phase === "timed") {
    const item = ctx.plan.items[state.itemIndex];
    if (!item || !state.timer) return 0;
    const holdS = holdSeconds(item);
    const remaining = timedRemainingS(state, nowMs);
    // The 3 s "Get in position" has no fill; the hold's own seconds fill the screen.
    return remaining > holdS ? 0 : drainPercent(holdS - remaining, holdS);
  }
  return null;
}

export interface DrainFill {
  style: CSSProperties;
  /** True for the one render where the fill went back down (a restart, the next move): the CSS
   *  makes that jump instant instead of sweeping the screen back over a second. */
  reset: boolean;
}

/** The drain props of the screen root for this render, or `null` when the view has no fill.
 *  Hook: called on every render of the host, before any early return. */
export function useDrainFill(percent: number | null): DrainFill | null {
  const previous = useRef<number | null>(null);
  const reset =
    percent !== null && (previous.current === null ? percent > 0 : percent < previous.current);
  useEffect(() => {
    previous.current = percent;
  });
  return percent === null ? null : { style: drainStyle(percent) as CSSProperties, reset };
}
