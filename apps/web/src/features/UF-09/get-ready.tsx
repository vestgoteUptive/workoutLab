// UF-09.1 Get ready (T-0304f, parent AC-B1, D-0111 §4 §8). Principle 1: one countdown, the first
// item, and the way in. The 5 s countdown is the machine's persisted wall-clock timer
// (NFR-TIME-1); at 0 the host dispatches `COUNTDOWN_END`, and "Start now" does that at once.
import { useEffect, useRef } from "react";
import { ArrowIcon } from "../../components/icons/index.js";
import { en } from "../../lib/i18n/en.js";
import { itemSummary } from "../../lib/i18n/workout.js";
import { remainingS } from "./timer.js";
import type { ViewProps } from "./views.js";

/** The first thing the user does: "Warm-up" with its summary (D-0066 per-move time), or the first
 *  exercise's library name (its id when the entry is missing, D-0118 §8) with its summary. */
function firstStep({ ctx }: Pick<ViewProps, "ctx">): { name: string; summary: string } {
  const { warmup, items } = ctx.plan;
  if (warmup.length > 0) {
    return {
      name: en.uf09.indexWarmup,
      summary: en.uf09.warmupSummary(warmup.length, warmup[0]!.durationS),
    };
  }
  const item = items[0];
  if (!item) return { name: "", summary: "" };
  return {
    name: ctx.library.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId,
    summary: itemSummary(item),
  };
}

export function GetReady({ state, ctx, nowMs, send }: ViewProps) {
  const startRef = useRef<HTMLButtonElement>(null);
  const first = firstStep({ ctx });
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
      <p className="wl-uf09__note wl-type-label" data-field="first-up">
        {en.uf09.firstUp}
      </p>
      <p className="wl-uf09__first-item wl-type-page-title" data-field="first-item">
        {first.name}
      </p>
      <p className="wl-uf09__note wl-type-label" data-field="first-summary">
        {first.summary}
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
