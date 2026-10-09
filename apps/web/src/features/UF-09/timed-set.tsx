// UF-09.7 Timed set (T-0304c, parent AC-C2–C4, D-0119 §1–§4, D-0062 §5). Principle 1: the hold,
// its ring, and the ring's own pause. One wall-clock timer runs the 3 s "Get in position" and the
// hold (NFR-TIME-1); the hold is the engine's `prefill.durationS` (principle 3). At 0 the host
// logs the hold once through the hook (D-0119 §3); this view only shows a failed write's retry.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { en } from "../../lib/i18n/en.js";
import { POSITION_S, holdSeconds, timedRemainingS } from "./machine.js";
import { Ring } from "./ring.js";
import { formatClock } from "./timer.js";
import type { ViewProps } from "./views.js";

/** The pre-fill kinds that read "Easing back in" (D-0062 §5, D-0119 §4). No kind claims "same as
 *  last time": the plan carries no previous hold. */
const EASING_KINDS: ReadonlySet<string> = new Set(["hold_after_break", "reentry"]);

const NO_RETRY = () => Promise.resolve();

/** Focus has nowhere to be: the focused element left the DOM (T-0423, NFR-A11Y-1). */
const focusLost = (active: Element | null) => active === null || active === document.body;

export function TimedSet({
  state,
  ctx,
  nowMs,
  send,
  holdFailed = false,
  onLogHold = NO_RETRY,
}: ViewProps) {
  const item = ctx.plan.items[state.itemIndex]!;
  const name = ctx.library.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId;
  const holdS = holdSeconds(item);
  const remaining = state.timer ? timedRemainingS(state, nowMs) : POSITION_S + holdS;
  const inPosition = remaining > holdS;
  const shown = inPosition ? remaining - holdS : remaining;
  const fraction = inPosition ? shown / POSITION_S : holdS > 0 ? shown / holdS : 0;
  const ringPaused = state.timerPausedAtMs !== null;
  const easing = EASING_KINDS.has(item.prefill.kind);
  const [retrying, setRetrying] = useState(false);
  const pending = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const logHoldRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const running = remaining > 0;

  // Entry focus while the hold runs: the ring toggle. A mount at 0 (a restore, or back from
  // UF-09.9 / an overlay) has no toggle, and the two layout effects below place focus instead:
  // the heading, then "Log hold" when the write has already failed (T-0423 rework).
  useEffect(() => {
    toggleRef.current?.focus();
  }, []);

  // At 0 the toggle leaves the DOM; if it had focus, the heading takes it while the hold is saved
  // (T-0423 AC-2, AC-4 on a mount at 0). A control the user focused elsewhere keeps it.
  useLayoutEffect(() => {
    if (!running && focusLost(document.activeElement)) headingRef.current?.focus();
  }, [running]);

  // A failed write shows "Log hold"; focus moves to it unless the user is in the chrome (AC-3).
  useLayoutEffect(() => {
    if (!holdFailed) return;
    const active = document.activeElement;
    if (focusLost(active) || viewRef.current?.contains(active)) logHoldRef.current?.focus();
  }, [holdFailed]);

  const retry = () => {
    // One write per tap (NFR-SYNC-1): a second tap while the first is pending does nothing.
    if (pending.current) return;
    pending.current = true;
    setRetrying(true);
    onLogHold().then(
      () => undefined,
      () => {
        pending.current = false;
        setRetrying(false);
      },
    );
  };

  return (
    <div ref={viewRef} className="wl-uf09__view">
      <p className="wl-uf09__state">{en.uf09.timedCaption(state.setIndex + 1, item.sets)}</p>
      <h1 ref={headingRef} className="wl-uf09__title" tabIndex={-1}>
        {name}
      </h1>
      <p className="wl-uf09__load" data-field="target">
        {en.uf09.holdTarget(formatClock(holdS))}
      </p>
      {easing ? (
        <p className="wl-uf09__cue" data-field="kind">
          {en.uf09.easingBackIn}
        </p>
      ) : null}
      <Ring fraction={fraction} warn={inPosition}>
        <p className="wl-uf09__ring-go" data-field="phase">
          {inPosition ? en.uf09.getInPosition : en.uf09.holdPhase}
        </p>
        <p className="wl-uf09__ring-time" role="timer">
          {inPosition ? String(shown) : formatClock(shown)}
        </p>
      </Ring>
      {running ? (
        <button
          ref={toggleRef}
          type="button"
          className="wl-uf09__secondary wl-uf09__wide"
          data-action="ring"
          onClick={() => send({ type: ringPaused ? "TIMER_RESUME" : "TIMER_PAUSE" })}
        >
          {ringPaused ? en.uf09.resumeTimer : en.uf09.pauseTimer}
        </button>
      ) : null}
      {holdFailed ? (
        <button
          ref={logHoldRef}
          type="button"
          className="wl-uf09__primary wl-uf09__wide"
          data-action="primary"
          data-state={retrying ? "saving" : undefined}
          aria-busy={retrying ? true : undefined}
          aria-disabled={retrying ? true : undefined}
          onClick={retry}
        >
          {en.uf09.logHold}
        </button>
      ) : null}
      <p className="wl-uf09__status" aria-live="polite">
        {holdFailed ? en.uf09.holdError : null}
      </p>
    </div>
  );
}
