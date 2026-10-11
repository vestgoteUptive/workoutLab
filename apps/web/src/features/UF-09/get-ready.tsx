// UF-09.1 Get ready (T-0304f, parent AC-B1, D-0111 §4 §8). Principle 1: one countdown, the first
// item, and the way in. The 5 s countdown is the machine's persisted wall-clock timer
// (NFR-TIME-1); at 0 the host dispatches `COUNTDOWN_END`, and "Start now" does that at once.
import { useEffect, useRef } from "react";
import { ArrowIcon } from "../../components/icons/index.js";
import { en } from "../../lib/i18n/en.js";
import { remainingS } from "./timer.js";
import type { ViewProps } from "./views.js";

/** The first thing the user does: "Warm-up", or the first exercise's library name (its id when
 *  the entry is missing, D-0118 §8). */
function firstItemName({ ctx }: Pick<ViewProps, "ctx">): string {
  if (ctx.plan.warmup.length > 0) return en.uf09.indexWarmup;
  const item = ctx.plan.items[0];
  if (!item) return "";
  return ctx.library.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId;
}

export function GetReady({ state, ctx, nowMs, send }: ViewProps) {
  const startRef = useRef<HTMLButtonElement>(null);
  const hasWarmup = ctx.plan.warmup.length > 0;
  const remaining = state.timer ? remainingS(state.timer, nowMs) : null;

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  // The single digit is the countdown role; "GO" is two letters and would not fit that size.
  const digit = remaining !== null && remaining > 0;

  return (
    <div className="wl-uf09__view wl-uf09__view--ready">
      <h1 className="wl-uf09__state wl-type-label">{en.uf09.titles.getReady}</h1>
      {remaining === null ? null : (
        <p
          className={`${digit ? "wl-type-countdown" : "wl-type-hero-number"} wl-uf09__count`}
          role="timer"
        >
          {digit ? String(remaining) : en.uf09.go}
        </p>
      )}
      <p className="wl-uf09__first-item wl-type-page-title" data-field="first-item">
        {firstItemName({ ctx })}
      </p>
      <button
        ref={startRef}
        type="button"
        className="wl-button--session wl-uf09__action"
        data-action="primary"
        onClick={() => send({ type: "COUNTDOWN_END" })}
      >
        {en.uf09.startNow}
        <ArrowIcon />
      </button>
      {hasWarmup ? (
        <button
          type="button"
          className="wl-button--session-outline wl-uf09__action wl-uf09__action--second"
          onClick={() => send({ type: "SKIP_WARMUP" })}
        >
          {en.uf09.skipWarmup}
        </button>
      ) : null}
    </div>
  );
}
