// UF-09 seam registry (T-0304e, D-0071 §4, D-0111 §1). Other flows show their UI inside focus
// mode only through these two arrays; each seam ticket's one UF-09 grant is this file:
// - T-0306b adds `swap` to both arrays (T-0422, D-0142 §7 §8);
// - T-0305a (T-0416) adds `how-to` and `list-view` to `pauseSeamActions`.
// An entry's overlay replaces the current screen while it is open (principle 1). It gets the
// session through `ctx` and never imports UF-09, so there are no import cycles.
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { en } from "../../lib/i18n/en.js";
import { retryableLazy } from "./lazy-retry.js";
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
const { uf05, uf03 } = en;

// UF-05.1 is loaded on first open (D-0142 §8): a dynamic import of the flow's `index`.
// A failed load is retried in-page (T-0451, D-0162 §3): see `retryableLazy`.
const swapSheet = retryableLazy(() =>
  import("../UF-05/index.js").then((m) => ({ default: m.SwapSheet })),
);

// UF-03.1 and the how-to are loaded on first open too (D-0142 §8; T-0416).
const ListView = lazy(() => import("../UF-03/index.js").then((m) => ({ default: m.ListView })));
const ExerciseHowTo = lazy(() =>
  import("../UF-04/index.js").then((m) => ({ default: m.ExerciseHowTo })),
);

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

/** What a lazy seam's overlay is named and closed by (its own flow's strings, D-0071 §4). */
interface SeamChrome {
  /** The dialog's accessible name. */
  label: string;
  /** The `data-screen-id` the overlay carries, when the seam is a screen (UF-05.1, UF-03.1). */
  screenId?: string;
  closeLabel: string;
  loading: string;
  loadFailed: string;
  /** The "Try again" label; set only for a seam whose lazy view can be retried (T-0451). */
  retryLabel?: string;
}

const swapChrome: SeamChrome = {
  label: uf05.titleFallback,
  screenId: "UF-05.1",
  closeLabel: uf05.close,
  loading: uf05.loading,
  loadFailed: uf05.loadFailed,
  retryLabel: uf05.retry,
};
const listViewChrome: SeamChrome = {
  label: uf03.listViewName,
  screenId: "UF-03.1",
  closeLabel: uf03.seamClose,
  loading: uf03.seamLoading,
  loadFailed: uf03.seamLoadFailed,
};
const howToChrome: SeamChrome = {
  label: uf03.howToAction,
  closeLabel: uf03.seamClose,
  loading: uf03.seamLoading,
  loadFailed: uf03.seamLoadFailed,
};

/**
 * What a seam's overlay shows while its chunk is loading, or after it failed to load: still one
 * task on screen, with a way back to where the seam was tapped (`ctx.close`). Focus moves to
 * Close, so a keyboard user is never stranded on an empty overlay.
 */
function SeamPlaceholder({
  message,
  chrome,
  onClose,
  onRetry,
}: {
  message: string;
  chrome: SeamChrome;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={chrome.label}
      className="wl-uf09__view"
      {...(chrome.screenId ? { "data-screen-id": chrome.screenId } : {})}
    >
      <p className="wl-uf09__status" role="status">
        {message}
      </p>
      {onRetry && chrome.retryLabel ? (
        <button type="button" className="wl-uf09__secondary wl-uf09__wide" onClick={onRetry}>
          {chrome.retryLabel}
        </button>
      ) : null}
      <button
        ref={closeRef}
        type="button"
        className="wl-uf09__secondary wl-uf09__wide"
        onClick={onClose}
      >
        {chrome.closeLabel}
      </button>
    </div>
  );
}

interface BoundaryProps {
  onClose: () => void;
  chrome: SeamChrome;
  /** Shows "Try again" in the failure state (swap only, T-0451). */
  onRetry?: () => void;
  /** Called once when the boundary catches (swap resets its lazy here, so the next open retries). */
  onFailed?: () => void;
  children: ReactNode;
}

/** Catches a rejected seam import (a stale deploy's 404 chunk) and any render error inside the
 *  overlay, so the host stays mounted. It wraps only the lazy view, nothing outside the overlay. */
class SeamBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onFailed?.();
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <SeamPlaceholder
          message={this.props.chrome.loadFailed}
          chrome={this.props.chrome}
          onClose={this.props.onClose}
          {...(this.props.onRetry ? { onRetry: this.props.onRetry } : {})}
        />
      );
    }
    return this.props.children;
  }
}

/** A lazy seam view inside the shared boundary and a loading placeholder with Close. */
function LazySeam({
  ctx,
  chrome,
  onRetry,
  onFailed,
  children,
}: {
  ctx: FocusSession;
  chrome: SeamChrome;
  onRetry?: () => void;
  onFailed?: () => void;
  children: ReactNode;
}) {
  return (
    <SeamBoundary
      onClose={ctx.close}
      chrome={chrome}
      {...(onRetry ? { onRetry } : {})}
      {...(onFailed ? { onFailed } : {})}
    >
      <Suspense
        fallback={<SeamPlaceholder message={chrome.loading} chrome={chrome} onClose={ctx.close} />}
      >
        {children}
      </Suspense>
    </SeamBoundary>
  );
}

/** The UF-05.1 sheet over the D-0142 §7 target, fixed when the overlay opens (a re-render after
 *  `replaceItem` resolves never moves it). "Use …" writes through `replaceItem` (the queue,
 *  D-0071 §6) and then closes; a rejected write leaves the sheet open with its notice. */
function SwapOverlay({ ctx }: { ctx: FocusSession }) {
  const [target] = useState(() => swapTarget(ctx));
  // "Try again" remounts the boundary and the lazy sheet; the lazy was already made again when
  // the failure was caught, so the remount imports again (T-0451).
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const SwapSheet = swapSheet.Component;
  return (
    <LazySeam
      key={attempt}
      ctx={ctx}
      chrome={swapChrome}
      onFailed={swapSheet.reset}
      onRetry={retry}
    >
      <>
        <SwapSheet
          workout={ctx.workout}
          itemIndex={target}
          onApply={async (result) => {
            await ctx.replaceItem(target, result.plan.items[target]!, result.plan.mainLiftId);
            ctx.close();
          }}
          onClose={ctx.close}
        />
      </>
    </LazySeam>
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

/** The how-to dialog for the current item's exercise (T-0416, D-0071 §4). While it loads the
 *  placeholder has Close (D-0142 §8). */
function HowToOverlay({ ctx }: { ctx: FocusSession }) {
  const exerciseId = ctx.plan.items[ctx.currentItemIndex]?.exerciseId ?? "";
  return (
    <LazySeam ctx={ctx} chrome={howToChrome}>
      <ExerciseHowTo exerciseId={exerciseId} onClose={ctx.close} />
    </LazySeam>
  );
}

/** UF-04's how-to over the paused workout: the workout stays paused (D-0071 §4). */
const howTo: SeamAction = {
  id: "how-to",
  label: uf03.howToAction,
  render: (ctx) => <HowToOverlay ctx={ctx} />,
  keepsClockRunning: false,
};

/** UF-03.1 List view (T-0416): the clocks keep running and the check point stays `"next"`. */
const listView: SeamAction = {
  id: "list-view",
  label: uf03.listViewAction,
  render: (ctx) => (
    <LazySeam ctx={ctx} chrome={listViewChrome}>
      <ListView ctx={ctx} />
    </LazySeam>
  ),
  keepsClockRunning: true,
};

/** Rendered on UF-09.9 Paused. */
export const pauseSeamActions: SeamAction[] = [swap, howTo, listView];

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
