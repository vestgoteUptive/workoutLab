// UF-09.9 Paused (T-0304d, D-0071 §4, D-0120 §6–§8). Principle 1: everything that isn't the
// current step lives here. Elapsed, Left and Sets, then Resume · the seams · Skip to next
// exercise · End workout in user flows v2 order. End confirms in place: still UF-09.9, still one
// task on screen. Every timer is stopped while this shows (the machine's pause).
import { useEffect, useRef, useState } from "react";
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
      <p data-field="elapsed">{en.uf09.elapsed(formatClock(elapsedS))}</p>
      <p data-field="left">{en.uf09.left(leftMinutes(session.row.time_budget_min, elapsedS))}</p>
      <p data-field="sets">{en.uf09.sets(state.loggedSets.length, planned)}</p>
    </div>
  );

  if (confirming) {
    return (
      <div className="wl-uf09__view">
        <h1 className="wl-uf09__title">{en.uf09.titles.paused}</h1>
        {numbers}
        <p className="wl-uf09__question" data-field="end-question">
          {en.uf09.endQuestion}
        </p>
        <button
          type="button"
          className="wl-uf09__primary wl-uf09__wide"
          aria-disabled={ending || planWritePending ? true : undefined}
          aria-busy={ending ? true : undefined}
          onClick={onEnd}
        >
          {en.uf09.endWorkout}
        </button>
        <button
          ref={cancelRef}
          type="button"
          className="wl-uf09__secondary wl-uf09__wide"
          onClick={() => {
            if (busy.current) return;
            setFailed(false);
            setConfirming(false);
          }}
        >
          {en.uf09.cancel}
        </button>
        <p className="wl-uf09__status" aria-live="polite">
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
    <div className="wl-uf09__view">
      <h1 className="wl-uf09__title">{en.uf09.titles.paused}</h1>
      {numbers}
      {moveFailed === null ? null : (
        <p className="wl-uf09__move-error" role="alert" data-field="move-error">
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
              className="wl-uf09__primary wl-uf09__wide"
              data-action="primary"
              aria-disabled={moving ? true : undefined}
              onClick={() => {
                if (!moving) onResume();
              }}
            >
              {en.uf09.resume}
            </button>
          );
        }
        if (id === "later") {
          return (
            <button
              key={id}
              type="button"
              className="wl-uf09__secondary wl-uf09__wide"
              data-action="later"
              aria-busy={moving ? true : undefined}
              onClick={onLater}
            >
              {en.uf09.doLater(laterName)}
            </button>
          );
        }
        if (id === "skip") {
          return (
            <button
              key={id}
              type="button"
              className="wl-uf09__secondary wl-uf09__wide"
              data-action="skip"
              onClick={onSkipItem}
            >
              {en.uf09.skipToNext}
            </button>
          );
        }
        if (id === "end") {
          return (
            <button
              key={id}
              type="button"
              className="wl-uf09__secondary wl-uf09__wide"
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
            className="wl-uf09__secondary wl-uf09__wide"
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
