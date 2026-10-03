// UF-09 seam registry (T-0304e, D-0071 §4, D-0111 §1). Other flows show their UI inside focus
// mode only through these two arrays; each seam ticket's one UF-09 grant is this file:
// - T-0306b adds `swap` to both arrays (T-0422, D-0142 §7 §8);
// - T-0305a adds `how-to` and `list-view` to `pauseSeamActions`.
// An entry's overlay replaces the current screen while it is open (principle 1). It gets the
// session through `ctx` and never imports UF-09, so there are no import cycles.
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { en } from "../../lib/i18n/en.js";
import { setsInItem } from "./machine.js";
import type { FocusSession } from "./session.js";

/** A seam entry. `ctx` is the `useFocusSession()` value, which includes `close()`. */
export interface SeamAction {
  id: string;
  /** The button label (the seam's own flow strings). */
  label: string;
  render(ctx: FocusSession): ReactNode;
  /** `false` (swap, how-to): the workout stays or becomes paused while the overlay is open.
   *  `true` (list-view): the clocks keep running, and the check point is always `"next"`. */
  keepsClockRunning: boolean;
}

// A seam's label is its own flow's string (D-0071 §4); this file is that flow's grant in UF-09.
const { uf05 } = en;

// UF-05.1 is loaded on first open (D-0142 §8): a dynamic import of the flow's `index`.
const SwapSheet = lazy(() => import("../UF-05/index.js").then((m) => ({ default: m.SwapSheet })));

type SwapTargetInput = Pick<FocusSession, "plan" | "loggedSets" | "currentItemIndex" | "state">;

/**
 * The item a seam swap replaces (D-0142 §7). Pure: the first item from `currentItemIndex` on
 * that has an unlogged planned position (back-off included) and isn't in `skippedItems`; if there
 * is none, `currentItemIndex`. On UF-09.6 that is the upcoming item, because `next` holds it.
 */
export function swapTarget(ctx: SwapTargetInput): number {
  const skipped = ctx.state.skippedItems ?? [];
  for (let i = ctx.currentItemIndex; i < ctx.plan.items.length; i += 1) {
    if (skipped.includes(i)) continue;
    const logged = new Set(ctx.loggedSets.filter((s) => s.itemIndex === i).map((s) => s.setIndex));
    const item = ctx.plan.items[i]!;
    for (let k = 0; k < setsInItem(item); k += 1) if (!logged.has(k)) return i;
  }
  return ctx.currentItemIndex;
}

/**
 * What the overlay shows while the UF-05 chunk is loading, or after it failed to load: still one
 * task on screen (UF-05.1), with a way back to where Swap was tapped (`ctx.close`). Focus moves
 * to Close, so a keyboard user is never stranded on an empty overlay.
 */
function SwapPlaceholder({ message, onClose }: { message: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={uf05.titleFallback}
      className="wl-uf09__view"
      data-screen-id="UF-05.1"
    >
      <p className="wl-uf09__status" role="status">
        {message}
      </p>
      <button
        ref={closeRef}
        type="button"
        className="wl-uf09__secondary wl-uf09__wide"
        onClick={onClose}
      >
        {uf05.close}
      </button>
    </div>
  );
}

interface BoundaryProps {
  onClose: () => void;
  children: ReactNode;
}

/** Catches a rejected UF-05 import (a stale deploy's 404 chunk) and any render error inside the
 *  sheet, so the host stays mounted. It wraps only the lazy sheet, nothing outside the overlay. */
class SwapBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <SwapPlaceholder message={uf05.loadFailed} onClose={this.props.onClose} />;
    }
    return this.props.children;
  }
}

/** The UF-05.1 sheet over the D-0142 §7 target, fixed when the overlay opens (a re-render after
 *  `replaceItem` resolves never moves it). "Use …" writes through `replaceItem` (the queue,
 *  D-0071 §6) and then closes; a rejected write leaves the sheet open with its notice. */
function SwapOverlay({ ctx }: { ctx: FocusSession }) {
  const [target] = useState(() => swapTarget(ctx));
  return (
    <SwapBoundary onClose={ctx.close}>
      <Suspense fallback={<SwapPlaceholder message={uf05.loading} onClose={ctx.close} />}>
        <SwapSheet
          workout={ctx.workout}
          itemIndex={target}
          onApply={async (result) => {
            await ctx.replaceItem(target, result.plan.items[target]!, result.plan.mainLiftId);
            ctx.close();
          }}
          onClose={ctx.close}
        />
      </Suspense>
    </SwapBoundary>
  );
}

function renderSwap(ctx: FocusSession): ReactNode {
  return <SwapOverlay ctx={ctx} />;
}

/** UF-05.1 Swap (T-0422). The workout stays paused while the sheet is open (D-0071 §4). */
const swap: SeamAction = {
  id: "swap",
  label: uf05.swapAction,
  render: renderSwap,
  keepsClockRunning: false,
};

/** Rendered on UF-09.9 Paused. T-0305a adds `how-to` and `list-view`. */
export const pauseSeamActions: SeamAction[] = [swap];

/** Rendered on UF-09.6 Next exercise. */
export const nextSeamActions: SeamAction[] = [swap];

export type SeamPlace = "pause" | "next";

/** User flows v2 order, built-ins and seams together (D-0071 §4). */
const ORDER: Record<SeamPlace, readonly string[]> = {
  pause: ["resume", "swap", "skip", "how-to", "list-view", "end"],
  next: ["ready", "swap"],
};

/** The action ids to render, in v2 order. An id the order doesn't know is dropped. Pure. */
export function orderActions(
  builtIns: readonly string[],
  seams: readonly { id: string }[],
  place: SeamPlace,
): string[] {
  const present = new Set([...builtIns, ...seams.map((s) => s.id)]);
  return ORDER[place].filter((id) => present.has(id));
}
