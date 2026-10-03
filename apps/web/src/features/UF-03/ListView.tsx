// UF-03.1 List view, read side (T-0416, D-0142 §3). Reached only from UF-09.9 Paused ("List view"):
// an opt-in exception to focus mode that still has no tab bar, no C-01 and no links out of the
// session (principle 1). It reads the plan and `ctx` (never `useFocusSession()`: UF-03 doesn't
// import UF-09, D-0142 §5), plus IndexedDB; no `refresh*` (D-0111 §11), so it renders offline.
// Principle 3: the rows show the engine's pre-fill (`item.prefill`, `item.backoff`); "Previous" is
// display data only. Logging from the rows is T-0417.
import { useEffect, useId, useRef, useState } from "react";
import type { LibraryExercise, SessionPlan, WorkoutItem } from "@workoutlab/shared";
import { formatDecimal } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemSummary, restLabel } from "../../lib/i18n/workout.js";
import { loadExerciseDetail } from "../../lib/offline/index.js";
import { ExerciseHowTo } from "../UF-04/index.js";
import { loadListData, previousSets, type ListData } from "./list-data.js";
import "./list-view.css";

/** The part of `useFocusSession()` the List view reads (D-0142 §5): its own type, so UF-03 has no
 *  import of UF-09. The real value is assignable to it. */
export interface ListViewCtx {
  sessionId: string;
  plan: SessionPlan;
  loggedSets: readonly {
    itemIndex: number;
    setIndex: number;
    exerciseId: string;
    reps: number | null;
    weightKg: number | null;
    durationS: number | null;
  }[];
  currentItemIndex: number;
  elapsedS: number;
  close(): void;
  finish(): Promise<void>;
}

export interface ListViewProps {
  ctx: ListViewCtx;
  /** Pinned by tests; the runtime default otherwise. */
  locale?: string | undefined;
}

const { uf03 } = en;

/** The cached cue, read once per exercise; a missing detail or a rejected read gives `null`. */
function useCue(exerciseId: string): string | null {
  const [cue, setCue] = useState<{ id: string; text: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => loadExerciseDetail(exerciseId))
      .then(
        (detail) => {
          if (live) setCue({ id: exerciseId, text: detail?.cue ?? null });
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [exerciseId]);
  return cue?.id === exerciseId ? cue.text : null;
}

function isTimed(item: WorkoutItem, exercise: LibraryExercise | undefined): boolean {
  return exercise?.timed ?? (item.repsMin === null && item.durationS !== null);
}

/** Sets in a card: the planned ones plus the back-off set. */
function setCount(item: WorkoutItem): number {
  return item.sets + (item.backoff ? 1 : 0);
}

interface CardProps {
  ctx: ListViewCtx;
  data: ListData;
  index: number;
  locale: string | undefined;
  current: boolean;
  onHowTo(): void;
}

function Rows({ ctx, data, index, locale }: Omit<CardProps, "current" | "onHowTo">) {
  const item = ctx.plan.items[index]!;
  const exercise = data.library.find((e) => e.id === item.exerciseId);
  const timed = isTimed(item, exercise);
  const showKg = !timed && exercise?.externalLoad !== false;
  const previous = previousSets(data, item.exerciseId, ctx.sessionId);
  const rows: number[] = Array.from({ length: setCount(item) }, (_, i) => i);
  return (
    <table className="wl-uf03-list__table">
      <thead>
        <tr>
          <th scope="col">{uf03.colSet}</th>
          <th scope="col">{uf03.colPrevious}</th>
          {showKg ? <th scope="col">{uf03.colWeight}</th> : null}
          <th scope="col">{timed ? uf03.colSeconds : uf03.colReps}</th>
          <th scope="col">{uf03.colDone}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => {
          const backoff = item.backoff !== null && i >= item.sets;
          const n = i + 1;
          const logged = ctx.loggedSets.find(
            (s) => s.itemIndex === index && s.setIndex === i && s.exerciseId === item.exerciseId,
          );
          const weight = logged
            ? logged.weightKg
            : backoff
              ? item.backoff!.weightKg
              : item.prefill.weightKg;
          const reps = logged
            ? logged.reps
            : backoff
              ? item.backoff!.reps
              : (item.prefill.reps ?? item.repsMin);
          const seconds = logged ? logged.durationS : (item.prefill.durationS ?? item.durationS);
          const prev = previous[i];
          let prevText: string = uf03.noPrevious;
          if (prev) {
            if (timed) {
              if (prev.durationS !== null) prevText = uf03.previousSeconds(prev.durationS);
            } else if (prev.reps !== null) {
              prevText =
                showKg && prev.weightKg !== null
                  ? uf03.previousLoad(formatDecimal(prev.weightKg, locale), prev.reps)
                  : uf03.previousReps(prev.reps);
            }
          }
          return (
            <tr
              key={i}
              data-part="set-row"
              data-set-index={i}
              data-logged={logged ? "" : undefined}
            >
              <th scope="row">{backoff ? uf03.backoffRow : n}</th>
              <td data-part="previous">{prevText}</td>
              {showKg ? (
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    readOnly
                    aria-label={uf03.weightLabel(n)}
                    value={weight === null ? "" : formatDecimal(weight, locale)}
                  />
                </td>
              ) : null}
              <td>
                {timed ? (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      readOnly
                      aria-label={uf03.secondsLabel(n)}
                      value={seconds === null ? "" : `${seconds}`}
                    />
                    <span className="wl-uf03-list__unit">{uf03.secondsUnit}</span>
                  </>
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    readOnly
                    aria-label={uf03.repsLabel(n)}
                    value={reps === null ? "" : `${reps}`}
                  />
                )}
              </td>
              <td>
                <input
                  type="checkbox"
                  readOnly
                  checked={logged !== undefined}
                  aria-label={logged ? uf03.markNotDone(n) : uf03.markDone(n)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Card({ ctx, data, index, locale, current, onHowTo }: CardProps) {
  const item = ctx.plan.items[index]!;
  return (
    <>
      <p className="wl-uf03-list__target">
        <span>{uf03.targetLabel}</span> <span data-part="target">{itemSummary(item)}</span>
      </p>
      {current ? <Cue exerciseId={item.exerciseId} /> : null}
      {current ? (
        <button type="button" className="wl-uf03-list__button" onClick={onHowTo}>
          {uf03.howToAction}
        </button>
      ) : null}
      <Rows ctx={ctx} data={data} index={index} locale={locale} />
    </>
  );
}

function Cue({ exerciseId }: { exerciseId: string }) {
  const cue = useCue(exerciseId);
  return cue ? (
    <p className="wl-uf03-list__cue" data-part="cue">
      {cue}
    </p>
  ) : null;
}

export function ListView({ ctx, locale }: ListViewProps) {
  const [data, setData] = useState<ListData | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  useEffect(() => {
    let live = true;
    void loadListData().then((value) => {
      if (live) setData(value);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const onFinish = () => {
    if (busy.current) return;
    busy.current = true;
    setFinishing(true);
    setFailed(false);
    ctx.finish().then(
      // On success the route is the summary and this view unmounts.
      () => undefined,
      () => {
        busy.current = false;
        setFinishing(false);
        setFailed(true);
      },
    );
  };

  const currentItem = ctx.plan.items[ctx.currentItemIndex];

  return (
    <div
      className="wl-uf03-list"
      data-screen-id="UF-03.1"
      role="region"
      aria-labelledby={headingId}
    >
      <h1 id={headingId} className="wl-uf03-list__title">
        {uf03.listViewName}
      </h1>
      {confirming ? (
        <div className="wl-uf03-list__header" data-part="finish-confirm">
          <p>{uf03.finishQuestion}</p>
          <button
            type="button"
            className="wl-uf03-list__primary"
            aria-disabled={finishing ? true : undefined}
            aria-busy={finishing ? true : undefined}
            onClick={onFinish}
          >
            {uf03.finish}
          </button>
          <button
            ref={keepRef}
            type="button"
            className="wl-uf03-list__button"
            onClick={() => {
              if (busy.current) return;
              setFailed(false);
              setConfirming(false);
            }}
          >
            {uf03.keepGoing}
          </button>
          <p className="wl-uf03-list__status" aria-live="polite">
            {failed ? uf03.finishError : null}
          </p>
        </div>
      ) : (
        <div className="wl-uf03-list__header">
          <p data-part="elapsed">{uf03.elapsed(restLabel(ctx.elapsedS))}</p>
          <button type="button" className="wl-uf03-list__button" onClick={ctx.close}>
            {uf03.focusMode}
          </button>
          <button
            type="button"
            className="wl-uf03-list__primary"
            onClick={() => setConfirming(true)}
          >
            {uf03.finish}
          </button>
        </div>
      )}
      {data === null
        ? null
        : ctx.plan.items.map((item, index) => {
            const current = index === ctx.currentItemIndex;
            const open = current || expanded === index;
            const name =
              data.library.find((e) => e.id === item.exerciseId)?.name ?? item.exerciseId;
            const done = ctx.loggedSets.filter(
              (s) => s.itemIndex === index && s.exerciseId === item.exerciseId,
            ).length;
            return (
              <section
                key={index}
                className="wl-uf03-list__card"
                data-part="card"
                data-current={current ? "" : undefined}
              >
                {current ? (
                  <h2 className="wl-uf03-list__name">{name}</h2>
                ) : (
                  <h2 className="wl-uf03-list__name">
                    <button
                      type="button"
                      className="wl-uf03-list__toggle"
                      aria-expanded={open}
                      onClick={() => setExpanded(expanded === index ? null : index)}
                    >
                      <span>{name}</span>
                      <span data-part="card-sets">{uf03.cardSets(done, setCount(item))}</span>
                    </button>
                  </h2>
                )}
                {open ? (
                  <Card
                    ctx={ctx}
                    data={data}
                    index={index}
                    locale={locale}
                    current={current}
                    onHowTo={() => setHowTo(true)}
                  />
                ) : null}
              </section>
            );
          })}
      {howTo && currentItem ? (
        <ExerciseHowTo exerciseId={currentItem.exerciseId} onClose={() => setHowTo(false)} />
      ) : null}
    </div>
  );
}
