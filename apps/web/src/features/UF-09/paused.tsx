// UF-09.9 Paused (T-0304d, D-0071 §4, D-0120 §6–§8). Principle 1: everything that isn't the
// current step lives here. Elapsed, Left and Sets, then Resume · the seams · Skip to next
// exercise · End workout in user flows v2 order. End confirms in place: still UF-09.9, still one
// task on screen. Every timer is stopped while this shows (the machine's pause).
import { useEffect, useRef, useState } from "react";
import { ArrowIcon, ChevronIcon } from "../../components/icons/index.js";
import { en } from "../../lib/i18n/en.js";
import { canDoLater, canSkipItem, setsInItem } from "./machine.js";
import { orderActions } from "./seams.js";
import { useFocusSession } from "./session.js";
import { formatClock } from "./timer.js";
import type { ViewProps } from "./views.js";

/** "Left {n} min" (D-0120 §6): the budget minus rule 8's elapsed time, rounded up, never < 0. */
export function leftMinutes(budgetMin: number, elapsedS: number): number {
  return Math.ceil(Math.max(0, budgetMin * 60 - elapsedS) / 60);
}

/** One stat, value first ("23:10 elapsed"): the value in the stat role, the last word as its label.
 *  Both sit in one element, so the text reads in order. */
function Stat({ field, text }: { field: string; text: string }) {
  const cut = text.lastIndexOf(" ");
  return (
    <p className="wl-uf09__stat" data-field={field}>
      <span className="wl-type-stat">{text.slice(0, cut)}</span>{" "}
      <span className="wl-type-label">{text.slice(cut + 1)}</span>
    </p>
  );
}

export function Paused({
  state,
  ctx,
  onResume,
  onSkipItem,
  onMoved,
  seams,
  planWritePending = false,
}: ViewProps) {
  const session = useFocusSession();
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [failed, setFailed] = useState(false);
  // T-0579: the pending move (Resume is inert meanwhile) and the item that failed to move.
  const [moving, setMoving] = useState(false);
  const [moveFailed, setMoveFailed] = useState<string | null>(null);
  const moveBusy = useRef(false);
  const busy = useRef(false);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus: Resume on entry and after Cancel; Cancel while the question shows (D-0120 §8).
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else resumeRef.current?.focus();
  }, [confirming]);

  const planned = ctx.plan.items.reduce((sum, item) => sum + setsInItem(item), 0);
  const elapsedS = session.elapsedS;

  const onEnd = () => {
    // A pending UF-09.8 plan write lands first (T-0304d rework).
    if (busy.current || planWritePending) return;
    busy.current = true;
    setEnding(true);
    setFailed(false);
    session.finish().then(
      // On success the route is the summary and this view unmounts.
      () => undefined,
      () => {
        busy.current = false;
        setEnding(false);
        setFailed(true);
      },
    );
  };

  const numbers = (
    <div className="wl-uf09__numbers">
      <Stat field="elapsed" text={en.uf09.elapsed(formatClock(elapsedS))} />
      <Stat field="left" text={en.uf09.left(leftMinutes(session.row.time_budget_min, elapsedS))} />
      <Stat field="sets" text={en.uf09.sets(state.loggedSets.length, planned)} />
    </div>
  );

  if (confirming) {
    return (
      <div className="wl-uf09__view wl-uf09__view--paused">
        <p className="wl-uf09__caption wl-type-label" data-field="paused-caption">
          {en.uf09.pausedCaption}
        </p>
        <h1 className="wl-uf09__title wl-type-page-title">{en.uf09.titles.paused}</h1>
        {numbers}
        <p className="wl-uf09__question wl-type-body" data-field="end-question">
          {en.uf09.endQuestion}
        </p>
        <button
          type="button"
          className="wl-button--primary wl-uf09__action"
          aria-disabled={ending || planWritePending ? true : undefined}
          aria-busy={ending ? true : undefined}
          onClick={onEnd}
        >
          {en.uf09.endWorkout}
          <ArrowIcon />
        </button>
        <button
          ref={cancelRef}
          type="button"
          className="wl-button--secondary wl-uf09__action wl-uf09__action--second"
          onClick={() => {
            if (busy.current) return;
            setFailed(false);
            setConfirming(false);
          }}
        >
          {en.uf09.cancel}
        </button>
        <p className="wl-uf09__status wl-type-label" aria-live="polite">
          {failed ? en.uf09.endError : null}
        </p>
      </div>
    );
  }

  const laterAllowed = canDoLater(state, ctx.plan, state.loggedSets);
  const laterItem =
    ctx.plan.items[
      state.resumePhase === "getReady" || state.resumePhase === "warmup" ? 0 : state.itemIndex
    ];
  const laterName = laterItem
    ? (ctx.library.find((e) => e.id === laterItem.exerciseId)?.name ?? laterItem.exerciseId)
    : "";
  const onLater = () => {
    if (moveBusy.current) return;
    moveBusy.current = true;
    setMoving(true);
    setMoveFailed(null);
    session.doLater().then((result) => {
      moveBusy.current = false;
      if (result.ok) {
        // The pause ends and this view unmounts; the host carries the name to UF-09.6.
        onMoved?.(result.name);
        return;
      }
      setMoving(false);
      setMoveFailed(laterName);
    });
  };

  const builtIns = [
    "resume",
    ...(laterAllowed ? ["later"] : []),
    ...(canSkipItem(state, ctx) ? ["skip"] : []),
    "end",
  ];
  const ids = orderActions(builtIns, seams, "pause");
  return (
    <div className="wl-uf09__view wl-uf09__view--paused">
      <p className="wl-uf09__caption wl-type-label" data-field="paused-caption">
        {en.uf09.pausedCaption}
      </p>
      <h1 className="wl-uf09__title wl-type-page-title">{en.uf09.titles.paused}</h1>
      {numbers}
      {moveFailed === null ? null : (
        <p className="wl-uf09__move-error wl-type-body" role="alert" data-field="move-error">
          {en.uf09.doLaterError(moveFailed)}
        </p>
      )}
      {ids.map((id) => {
        if (id === "resume") {
          return (
            <button
              key={id}
              ref={resumeRef}
              type="button"
              className="wl-button--session wl-uf09__resume"
              data-action="primary"
              aria-disabled={moving ? true : undefined}
              onClick={() => {
                if (!moving) onResume();
              }}
            >
              {en.uf09.resume}
              <ArrowIcon />
            </button>
          );
        }
        if (id === "later") {
          return (
            <button
              key={id}
              type="button"
              className="wl-row wl-uf09__row"
              data-action="later"
              aria-busy={moving ? true : undefined}
              onClick={onLater}
            >
              <span>{en.uf09.doLater(laterName)}</span>
              <ChevronIcon direction="down" />
            </button>
          );
        }
        if (id === "skip") {
          return (
            <button
              key={id}
              type="button"
              className="wl-row wl-uf09__row"
              data-action="skip"
              onClick={onSkipItem}
            >
              <span>{en.uf09.skipToNext}</span>
              <ArrowIcon />
            </button>
          );
        }
        if (id === "end") {
          return (
            <button
              key={id}
              type="button"
              className="wl-button--secondary wl-uf09__end"
              data-action="end"
              aria-disabled={planWritePending ? true : undefined}
              onClick={() => {
                if (!planWritePending) setConfirming(true);
              }}
            >
              {en.uf09.endWorkout}
            </button>
          );
        }
        const seam = seams.find((s) => s.id === id);
        return seam ? (
          <button
            key={id}
            type="button"
            className="wl-row wl-uf09__row"
            data-seam-id={seam.id}
            onClick={seam.onSelect}
          >
            <span>{seam.label}</span>
            <ArrowIcon />
          </button>
        ) : null;
      })}
    </div>
  );
}
