// UF-03.1 List view, read side (T-0416, D-0142 §3). Reached only from UF-09.9 Paused ("List view"):
// an opt-in exception to focus mode that still has no tab bar, no C-01 and no links out of the
// session (principle 1). It reads the plan and `ctx` (never `useFocusSession()`: UF-03 doesn't
// import UF-09, D-0142 §5), plus IndexedDB; no `refresh*` (D-0111 §11), so it renders offline.
// Principle 3: the rows show the engine's pre-fill (`item.prefill`, `item.backoff`); "Previous" is
// display data only. Logging from the rows is T-0417.
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { LibraryExercise, SessionPlan, WorkoutItem } from "@workoutlab/shared";
import { formatDecimal } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemSummary, restLabel } from "../../lib/i18n/workout.js";
import { loadExerciseDetail } from "../../lib/offline/index.js";
import { ExerciseHowTo } from "../UF-04/index.js";
import { loadListData, previousSets, type ListData } from "./list-data.js";
import { parseCount, parseWeight } from "./weight-parse.js";
import "./list-view.css";

/** What a check sends to `ctx.recordSet` (the real `FocusSetInput`, `source: "list"`). */
export interface ListSetInput {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  kind: "reps" | "timed";
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  rir: null;
  isWarmup: false;
  backoff: boolean;
  itemIndex: number;
  source: "list";
}

/** One field of a done row, changed (the real `SetEdit` accepts it). */
export type ListSetEdit = { weightKg: number } | { reps: number } | { durationS: number };

/** The part of `useFocusSession()` the List view reads (D-0142 §5): its own type, so UF-03 has no
 *  import of UF-09. The real value is assignable to it. */
export interface ListViewCtx {
  sessionId: string;
  plan: SessionPlan;
  loggedSets: readonly {
    clientId: string;
    itemIndex: number;
    setIndex: number;
    exerciseId: string;
    reps: number | null;
    weightKg: number | null;
    durationS: number | null;
  }[];
  currentItemIndex: number;
  elapsedS: number;
  /** Every List-view write goes through these three (D-0071 §5), never `lib/offline`. */
  recordSet(input: ListSetInput): Promise<unknown>;
  editSet(clientId: string, patch: ListSetEdit): Promise<void>;
  deleteSet(clientId: string): Promise<void>;
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

type Draft = { weight: string | null; reps: string | null; seconds: string | null };
const NO_DRAFT: Draft = { weight: null, reps: null, seconds: null };

interface RowProps {
  ctx: ListViewCtx;
  item: WorkoutItem;
  index: number;
  i: number;
  backoff: boolean;
  timed: boolean;
  showKg: boolean;
  locale: string | undefined;
  prevText: string;
}

/** One set row: check → `ctx.recordSet`, edit → `ctx.editSet` once on blur/Enter, uncheck →
 *  `ctx.deleteSet` (a tombstone). Every write goes through `ctx` (D-0071 §5). The row shows as
 *  done only after the write resolves. */
function SetRow({ ctx, item, index, i, backoff, timed, showKg, locale, prevText }: RowProps) {
  const n = i + 1;
  const hintId = useId();
  const [draft, setDraft] = useState<Draft>(NO_DRAFT);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const logged = ctx.loggedSets.find(
    (s) => s.itemIndex === index && s.setIndex === i && s.exerciseId === item.exerciseId,
  );
  const baseWeight = logged
    ? logged.weightKg
    : backoff
      ? item.backoff!.weightKg
      : item.prefill.weightKg;
  const baseReps = logged
    ? logged.reps
    : backoff
      ? item.backoff!.reps
      : (item.prefill.reps ?? item.repsMin);
  const baseSeconds = logged ? logged.durationS : (item.prefill.durationS ?? item.durationS);
  const weightText = draft.weight ?? (baseWeight === null ? "" : formatDecimal(baseWeight, locale));
  const repsText = draft.reps ?? (baseReps === null ? "" : `${baseReps}`);
  const secondsText = draft.seconds ?? (baseSeconds === null ? "" : `${baseSeconds}`);

  // An untouched field stands for its exact value (D-0128 §4); typed text is parsed.
  let weightKg: number | null = baseWeight;
  let weightInvalid = false;
  if (showKg && draft.weight !== null) {
    const parsed = parseWeight(draft.weight);
    if (parsed.ok) weightKg = parsed.value;
    else weightInvalid = true;
  }
  // A loaded lift needs a weight (empty is valid only on a bodyweight item, which has no field).
  if (showKg && weightKg === null) weightInvalid = true;
  const blocked = !logged && weightInvalid;

  const run = (write: () => Promise<unknown>) => {
    busy.current = true;
    setPending(true);
    setFailed(false);
    write().then(
      () => {
        busy.current = false;
        setPending(false);
        setDraft(NO_DRAFT);
      },
      () => {
        busy.current = false;
        setPending(false);
        setDraft(NO_DRAFT);
        setFailed(true);
      },
    );
  };

  const onToggle = () => {
    if (busy.current) return;
    if (logged) {
      run(() => ctx.deleteSet(logged.clientId));
      return;
    }
    if (blocked) return;
    const reps = draft.reps === null ? baseReps : (parseCount(draft.reps) ?? baseReps);
    const seconds =
      draft.seconds === null ? baseSeconds : (parseCount(draft.seconds) ?? baseSeconds);
    run(() =>
      ctx.recordSet({
        sessionId: ctx.sessionId,
        exerciseId: item.exerciseId,
        setIndex: i,
        kind: timed ? "timed" : "reps",
        reps: timed ? null : reps,
        weightKg: timed ? null : weightKg,
        durationS: timed ? seconds : null,
        rir: null,
        isWarmup: false,
        backoff,
        itemIndex: index,
        source: "list",
      }),
    );
  };

  /** Blur or Enter on a done row's field: one `editSet`, only when the parsed value changed. */
  const commit = (field: keyof Draft) => {
    const text = draft[field];
    if (text === null || !logged || busy.current) return;
    const keep = () => setDraft(NO_DRAFT);
    if (field === "weight") {
      const parsed = parseWeight(text);
      if (!parsed.ok || parsed.value === null) return keep();
      if (parsed.value === logged.weightKg || text.trim() === weightTextOf(logged.weightKg)) {
        return keep();
      }
      const kg = parsed.value;
      run(() => ctx.editSet(logged.clientId, { weightKg: kg }));
      return;
    }
    const value = parseCount(text);
    const current = field === "reps" ? logged.reps : logged.durationS;
    if (value === null || value === current) return keep();
    run(() =>
      ctx.editSet(logged.clientId, field === "reps" ? { reps: value } : { durationS: value }),
    );
  };
  const weightTextOf = (v: number | null) => (v === null ? "" : formatDecimal(v, locale));

  const fieldProps = (field: keyof Draft) => ({
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDraft((d) => ({ ...d, [field]: value }));
    },
    onBlur: () => commit(field),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commit(field);
    },
  });

  return (
    <tr data-part="set-row" data-set-index={i} data-logged={logged ? "" : undefined}>
      <th scope="row">{backoff ? uf03.backoffRow : n}</th>
      <td data-part="previous">{prevText}</td>
      {showKg ? (
        <td>
          <input
            type="text"
            inputMode="decimal"
            aria-label={uf03.weightLabel(n)}
            aria-describedby={blocked ? hintId : undefined}
            value={weightText}
            {...fieldProps("weight")}
          />
          <span id={hintId} className="wl-uf03-list__hint" aria-live="polite">
            {blocked ? uf03.weightHint(formatDecimal(82.5, locale)) : null}
          </span>
        </td>
      ) : null}
      <td>
        {timed ? (
          <>
            <input
              type="text"
              inputMode="numeric"
              aria-label={uf03.secondsLabel(n)}
              value={secondsText}
              {...fieldProps("seconds")}
            />
            <span className="wl-uf03-list__unit">{uf03.secondsUnit}</span>
          </>
        ) : (
          <input
            type="text"
            inputMode="numeric"
            aria-label={uf03.repsLabel(n)}
            value={repsText}
            {...fieldProps("reps")}
          />
        )}
      </td>
      <td>
        <input
          type="checkbox"
          checked={logged !== undefined}
          aria-label={logged ? uf03.markNotDone(n) : uf03.markDone(n)}
          aria-disabled={blocked ? true : undefined}
          aria-busy={pending ? true : undefined}
          onChange={onToggle}
        />
        <span className="wl-uf03-list__hint" aria-live="polite" data-part="row-status">
          {failed ? uf03.rowSaveFailed : null}
        </span>
      </td>
    </tr>
  );
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
            <SetRow
              key={i}
              ctx={ctx}
              item={item}
              index={index}
              i={i}
              backoff={item.backoff !== null && i >= item.sets}
              timed={timed}
              showKg={showKg}
              locale={locale}
              prevText={prevText}
            />
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
