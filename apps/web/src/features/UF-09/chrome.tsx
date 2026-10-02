// The UF-09 chrome (D-0111 §10, principle 1): a pause button, a thin progress bar and an
// index — nothing else. Offline shows only the icon (NFR-OFF-6, D-0066 §14).
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import type { FocusCtx, FocusState } from "./machine.js";

type SegmentState = "done" | "current" | "upcoming";

function inWarmup(state: FocusState): boolean {
  return state.phase === "getReady" || state.phase === "warmup";
}

/** 1 + N segments: the warm-up, then one per item (D-0111 §10). */
export function segmentStates(state: FocusState, ctx: FocusCtx): SegmentState[] {
  const warmupDone = ctx.plan.warmup.length === 0 || !inWarmup(state);
  const items = ctx.plan.items.map((_, i): SegmentState => {
    if (inWarmup(state)) return "upcoming";
    if (i < state.itemIndex) return "done";
    return i === state.itemIndex ? "current" : "upcoming";
  });
  return [warmupDone ? "done" : "current", ...items];
}

export function indexLabel(state: FocusState, ctx: FocusCtx): string {
  if (inWarmup(state)) return en.uf09.indexWarmup;
  return en.uf09.index(state.itemIndex + 1, ctx.plan.items.length);
}

export function Chrome({
  state,
  ctx,
  onPause,
}: {
  state: FocusState;
  ctx: FocusCtx;
  onPause: () => void;
}) {
  return (
    <div className="wl-uf09__chrome">
      <button
        type="button"
        className="wl-uf09__pause"
        aria-label={en.uf09.pauseWorkout}
        onClick={onPause}
      >
        <span className="wl-uf09__pause-icon" aria-hidden="true" />
      </button>
      <div className="wl-uf09__progress" aria-hidden="true">
        {segmentStates(state, ctx).map((s, i) => (
          <span key={i} className="wl-uf09__segment" data-state={s} />
        ))}
      </div>
      <span className="wl-uf09__index">{indexLabel(state, ctx)}</span>
      <OfflineStatus variant="icon" />
    </div>
  );
}
