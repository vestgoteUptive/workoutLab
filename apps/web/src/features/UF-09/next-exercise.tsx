// UF-09.6 Next exercise (T-0304f, D-0066 §10, D-0118 §8 §11). Principle 1: the next item, how
// much of it, its cue, and "I'm ready". The 60 s set-up countdown is the machine's persisted
// wall-clock timer (NFR-TIME-1); at 0 the host dispatches `READY`. Seam entries (T-0306b's Swap)
// sit at their `orderActions` positions (D-0071 §4).
import { useEffect, useId, useRef } from "react";
import { ArrowIcon, TickIcon } from "../../components/icons/index.js";
import { formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemSummary } from "../../lib/i18n/workout.js";
import { isBodyweight } from "./machine.js";
import { orderActions } from "./seams.js";
import { formatClock, remainingS } from "./timer.js";
import { useCue } from "./use-cue.js";
import type { ViewProps } from "./views.js";

export function NextExercise({
  state,
  ctx,
  locale,
  nowMs,
  send,
  seams,
  movedName = null,
}: ViewProps) {
  const item = ctx.plan.items[state.itemIndex]!;
  const name = ctx.library.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId;
  const weightKg =
    item.prefill.weightKg === null || isBodyweight(item.exerciseId, ctx.library)
      ? null
      : item.prefill.weightKg;
  const cue = useCue(item.exerciseId);
  const readyRef = useRef<HTMLButtonElement>(null);
  const setupId = useId();
  // T-0621 (D-0212 §1.4): how the item just finished went. Only after a lifted item: UF-09.6
  // after UF-09.1 or the warm-up is item 0, and a skipped item has no logged sets.
  const prev = state.itemIndex - 1;
  const prevItem = ctx.plan.items[prev];
  const prevSets = prevItem ? state.loggedSets.filter((s) => s.itemIndex === prev).length : 0;
  const prevName = prevItem
    ? (ctx.library.find((e) => e.id === prevItem.exerciseId)?.name ?? prevItem.exerciseId)
    : "";
  const ids = orderActions(["ready"], seams, "next");

  useEffect(() => {
    readyRef.current?.focus();
  }, []);

  return (
    <div className="wl-uf09__view wl-uf09__view--next">
      <p className="wl-uf09__state wl-type-label">{en.uf09.titles.next}</p>
      {prevSets > 0 ? (
        <p className="wl-uf09__note wl-type-label" data-field="exercise-done">
          <TickIcon size={16} aria-hidden="true" />
          {en.uf09.exerciseDone(prevName, prevSets)}
        </p>
      ) : null}
      <h1 className="wl-uf09__name wl-type-section">{name}</h1>
      {/* Two whole formatter outputs as siblings, never joined (D-0118 §11, D-0114 §5). */}
      <p className="wl-uf09__detail" data-field="detail">
        <span data-field="summary">{itemSummary(item)}</span>
        {weightKg === null ? null : (
          <>
            <span aria-hidden="true">{en.uf09.separator}</span>
            <span data-field="kg">{formatKg(weightKg, locale)}</span>
          </>
        )}
      </p>
      {cue ? (
        <p className="wl-uf09__cue wl-type-body" data-field="cue">
          {cue}
        </p>
      ) : null}
      {/* Present on mount, so the line is announced when it fills (T-0579, D-0205 §11). */}
      <p className="wl-uf09__status wl-type-label" role="status" data-field="moved">
        {movedName === null ? null : en.uf09.movedLater(movedName)}
      </p>
      {state.timer ? (
        <>
          <p id={setupId} className="wl-uf09__note wl-type-label" data-field="setup-label">
            {en.uf09.setupTime}
          </p>
          <p className="wl-uf09__count wl-type-hero-number" role="timer" aria-labelledby={setupId}>
            {formatClock(remainingS(state.timer, nowMs))}
          </p>
        </>
      ) : null}
      {ids.map((id) => {
        if (id === "ready") {
          return (
            <button
              key={id}
              ref={readyRef}
              type="button"
              className="wl-button--session wl-uf09__action"
              data-action="primary"
              onClick={() => send({ type: "READY" })}
            >
              {en.uf09.imReady}
              <ArrowIcon />
            </button>
          );
        }
        const seam = seams.find((s) => s.id === id);
        return seam ? (
          <button
            key={id}
            type="button"
            className="wl-button--session-outline wl-uf09__action wl-uf09__action--second"
            data-seam-id={seam.id}
            onClick={seam.onSelect}
          >
            {seam.label}
          </button>
        ) : null;
      })}
    </div>
  );
}
