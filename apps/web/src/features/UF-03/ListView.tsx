// UF-03.1 List view, read side (T-0416, D-0142 §3). Reached only from UF-09.9 Paused ("List view"):
// an opt-in exception to focus mode that still has no tab bar, no C-01 and no links out of the
// session (principle 1). It reads the plan and `ctx` (never `useFocusSession()`: UF-03 doesn't
// import UF-09, D-0142 §5), plus IndexedDB; no `refresh*` (D-0111 §11), so it renders offline.
// Principle 3: the rows show the engine's pre-fill (`item.prefill`, `item.backoff`); "Previous" is
// display data only. Logging from the rows is T-0417.
import {
  Component,
  Suspense,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { LibraryExercise, SessionPlan, Workout, WorkoutItem } from "@workoutlab/shared";
import { formatDecimal } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemSummary, restLabel } from "../../lib/i18n/workout.js";
import { loadExerciseDetail } from "../../lib/offline/index.js";
import { ExerciseHowTo } from "../UF-04/index.js";
import { retryableLazy } from "./lazy-retry.js";
import { loadListData, previousSets, type ListData } from "./list-data.js";
import { parseCount, parseWeight } from "./weight-parse.js";
import "./list-view.css";

const { uf03 } = en;

// T-0478: `React.lazy` through a `retryableLazy` wrapper, not a static import and not a plain
// `lazy()`. `ListView` is reachable through `UF-03/index.js`'s static `export { ListView }`; a
// static import of `SwapSheet` here would force `UF-05/index.js` to resolve just from importing
// `UF-03/index.js`'s `Summary` (the way UF-09's own tests do), defeating every "the chunk is
// slow/fails" UF-09 test for the unrelated UF-05 seam. A plain `lazy()` caches a rejected import
// for the page's life (D-0162 §3 exists for exactly this): `swapSheetLoader.reset()` on a caught
// failure makes a fresh lazy, so the *next* Swap tap imports again, not just "Try again" in place.
const swapSheetLoader = retryableLazy(() =>
  import("../UF-05/index.js").then((m) => ({ default: m.SwapSheet })),
);

/** A failed `SwapSheet` import (T-0478, D-0162 §3): the card's swap area shows this in place of
 *  the sheet, with "Try again" (imports again) and "Close" (back to the rows, a fresh Swap tap
 *  gets a fresh attempt either way — `reset()` already ran when the boundary caught it). */
class SwapLoadBoundary extends Component<
  { onClose(): void; onRetry(): void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    swapSheetLoader.reset();
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div role="status" className="wl-uf03-list__status">
          <p>{uf03.swapLoadFailed}</p>
          <button type="button" className="wl-uf03-list__button" onClick={this.props.onRetry}>
            {uf03.swapRetry}
          </button>
          <button type="button" className="wl-uf03-list__button" onClick={this.props.onClose}>
            {uf03.seamClose}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  /** The D-0069 §5 `Workout` the sheet ranks against (T-0478); reference-stable across a render
   *  that doesn't change the plan. */
  workout: Workout;
  /** The host's resolved time zone (T-0478), passed to `SwapSheet` unchanged. */
  timeZone: string;
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
  /** The running rest (the host's wall clock), or `null` outside a rest (UF-03.2, T-0418). */
  rest: { remainingS: number } | null;
  /** Every List-view write goes through these three (D-0071 §5), never `lib/offline`. */
  recordSet(input: ListSetInput): Promise<unknown>;
  editSet(clientId: string, patch: ListSetEdit): Promise<void>;
  deleteSet(clientId: string): Promise<void>;
  /** Starts a wall-clock rest for `exerciseId` (T-0418, D-0142 §3). */
  startRest(exerciseId: string): void;
  /** Moves the running rest by `deltaS` seconds, floored at 0, with no cap (T-0418). */
  adjustRest(deltaS: number): void;
  /** Ends the running rest now (T-0418). */
  skipRest(): void;
  /** Replaces item `index` (the current one or a later one, else `RangeError`) and writes
   *  `{...row, plan}`; `mainLiftId`, when given, becomes `plan.mainLiftId` (T-0478, D-0071 §6). */
  replaceItem(index: number, item: WorkoutItem, mainLiftId?: string | null): Promise<void>;
  close(): void;
  finish(): Promise<void>;
}

export interface ListViewProps {
  ctx: ListViewCtx;
  /** Pinned by tests; the runtime default otherwise. */
  locale?: string | undefined;
}

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

/** D-0142 §3: true once every planned set (back-off included) of every item has a live logged
 *  set. A rest never starts after the session's last planned set (T-0418 AC-2). `justLogged`, a
 *  position just checked whose write has resolved, counts as logged even before `ctx` (a possibly
 *  stale closure, D-0071 §5) carries it. T-0478: a position counts once logged under any
 *  exerciseId — a set logged before a swap (D-0140's free-position rule) still fills its slot. */
function allPlannedSetsLogged(
  ctx: ListViewCtx,
  justLogged: { itemIndex: number; setIndex: number; exerciseId: string } | null = null,
): boolean {
  return ctx.plan.items.every((item, itemIndex) => {
    const planned = setCount(item);
    const logged = new Set(
      ctx.loggedSets.filter((s) => s.itemIndex === itemIndex).map((s) => s.setIndex),
    );
    if (justLogged && justLogged.itemIndex === itemIndex) {
      logged.add(justLogged.setIndex);
    }
    for (let i = 0; i < planned; i += 1) if (!logged.has(i)) return false;
    return true;
  });
}

interface CardProps {
  ctx: ListViewCtx;
  data: ListData;
  index: number;
  locale: string | undefined;
  current: boolean;
  onHowTo(): void;
  /** The exercise name on screen now (T-0478): the Swap button's accessible name reads the old
   *  one before Apply, the new one after (AC-3). */
  name: string;
  swapRef: RefObject<HTMLButtonElement | null>;
}

/** T-0478 AC-1: the current card's "Swap" button, named for the exercise on screen so two cards'
 *  buttons are never confused by assistive tech. */
function SwapButton({
  name,
  swapRef,
  onOpen,
}: {
  name: string;
  swapRef: RefObject<HTMLButtonElement | null>;
  onOpen(): void;
}) {
  return (
    <button
      ref={swapRef}
      type="button"
      className="wl-uf03-list__button"
      aria-label={uf03.swapName(name)}
      onClick={onOpen}
    >
      {uf03.swap}
    </button>
  );
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
  /** An added row's opening values (the last row's, D-0142 §3); null for a planned row. */
  seed: Seed | null;
  /** Focus the first field on mount (a row just added by "+ Add set"). */
  focusOnMount: boolean;
  /** T-0472: called before an above-plan row is unchecked, so `Rows` keeps it (with these values)
   *  once the tombstone removes it from `ctx.loggedSets`. `null` for a planned row. */
  keepRow: ((seed: Seed) => void) | null;
  /** T-0478 AC-2: the logged exercise's library name, shown as a tag, when a row was logged
   *  before a swap and the card now shows a different exercise. `null` otherwise. */
  tagName: string | null;
}

interface Seed {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
}

/** One set row: check → `ctx.recordSet`, edit → `ctx.editSet` once on blur/Enter, uncheck →
 *  `ctx.deleteSet` (a tombstone). Every write goes through `ctx` (D-0071 §5). The row shows as
 *  done only after the write resolves. */
function SetRow({
  ctx,
  item,
  index,
  i,
  backoff,
  timed,
  showKg,
  locale,
  prevText,
  seed,
  focusOnMount,
  keepRow,
  tagName,
}: RowProps) {
  const n = i + 1;
  const hintId = useId();
  const countHintId = useId();
  const [draft, setDraft] = useState<Draft>(NO_DRAFT);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusOnMount) firstField.current?.focus();
  }, [focusOnMount]);
  // T-0478 AC-2: a row's own logged `exerciseId` wins over the card's current `item.exerciseId`
  // (keyed by `itemIndex`/`setIndex` alone), so a set logged before a swap stays shown.
  const logged = ctx.loggedSets.find((s) => s.itemIndex === index && s.setIndex === i);
  const baseWeight = logged
    ? logged.weightKg
    : seed
      ? seed.weightKg
      : backoff
        ? item.backoff!.weightKg
        : item.prefill.weightKg;
  const baseReps = logged
    ? logged.reps
    : seed
      ? seed.reps
      : backoff
        ? item.backoff!.reps
        : (item.prefill.reps ?? item.repsMin);
  const baseSeconds = logged
    ? logged.durationS
    : seed
      ? seed.durationS
      : (item.prefill.durationS ?? item.durationS);
  const weightText = draft.weight ?? (baseWeight === null ? "" : formatDecimal(baseWeight, locale));
  const repsText = draft.reps ?? (baseReps === null ? "" : `${baseReps}`);
  const secondsText = draft.seconds ?? (baseSeconds === null ? "" : `${baseSeconds}`);

  // An untouched field stands for its exact value (D-0128 §4); typed text is parsed.
  let weightKg: number | null = baseWeight;
  let weightInvalid = false;
  if (showKg && draft.weight !== null) {
    const parsed = parseWeight(draft.weight);
    // Text equal to the opening text stands for the exact value (82.125 stays, D-0128 §4).
    if (baseWeight !== null && draft.weight.trim() === formatDecimal(baseWeight, locale)) {
      weightKg = baseWeight;
    } else if (parsed.ok) weightKg = parsed.value;
    else weightInvalid = true;
  }
  // A loaded lift needs a weight (empty is valid only on a bodyweight item, which has no field).
  if (showKg && weightKg === null) weightInvalid = true;
  // Reps or seconds: whole numbers only, never silently replaced by the pre-fill.
  const countText = timed ? secondsText : repsText;
  const countInvalid = parseCount(countText) === null;
  const blocked = !logged && (weightInvalid || countInvalid);

  const run = (write: () => Promise<unknown>, onDone?: () => void) => {
    busy.current = true;
    setPending(true);
    setFailed(false);
    write().then(
      () => {
        busy.current = false;
        setPending(false);
        setDraft(NO_DRAFT);
        onDone?.();
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
      keepRow?.({ weightKg: logged.weightKg, reps: logged.reps, durationS: logged.durationS });
      run(() => ctx.deleteSet(logged.clientId));
      return;
    }
    if (blocked) return;
    const reps = draft.reps === null ? baseReps : parseCount(draft.reps);
    const seconds = draft.seconds === null ? baseSeconds : parseCount(draft.seconds);
    run(
      () =>
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
      // T-0418 AC-1/AC-2: a rest starts after a check resolves, unless no planned set of the
      // session is left unlogged, counting this just-checked set whether or not this closure's
      // `ctx` has caught up with it yet.
      () => {
        const just = { itemIndex: index, setIndex: i, exerciseId: item.exerciseId };
        if (!allPlannedSetsLogged(ctx, just)) ctx.startRest(item.exerciseId);
      },
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
      <th scope="row">
        {backoff ? uf03.backoffRow : n}
        {tagName === null ? null : (
          <span className="wl-uf03-list__tag" data-part="tag">
            {uf03.swapTag(tagName)}
          </span>
        )}
      </th>
      <td data-part="previous">{prevText}</td>
      {showKg ? (
        <td>
          <input
            type="text"
            inputMode="decimal"
            ref={firstField}
            aria-label={uf03.weightLabel(n)}
            aria-describedby={!logged && weightInvalid ? hintId : undefined}
            value={weightText}
            {...fieldProps("weight")}
          />
          <span id={hintId} className="wl-uf03-list__hint" aria-live="polite">
            {!logged && weightInvalid ? uf03.weightHint(formatDecimal(82.5, locale)) : null}
          </span>
        </td>
      ) : null}
      <td>
        {timed ? (
          <>
            <input
              type="text"
              inputMode="numeric"
              ref={showKg ? undefined : firstField}
              aria-label={uf03.secondsLabel(n)}
              aria-describedby={!logged && countInvalid ? countHintId : undefined}
              value={secondsText}
              {...fieldProps("seconds")}
            />
            <span className="wl-uf03-list__unit">{uf03.secondsUnit}</span>
            <span id={countHintId} className="wl-uf03-list__hint" aria-live="polite">
              {!logged && countInvalid ? uf03.secondsHint : null}
            </span>
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              ref={showKg ? undefined : firstField}
              aria-label={uf03.repsLabel(n)}
              aria-describedby={!logged && countInvalid ? countHintId : undefined}
              value={repsText}
              {...fieldProps("reps")}
            />
            <span id={countHintId} className="wl-uf03-list__hint" aria-live="polite">
              {!logged && countInvalid ? uf03.repsHint : null}
            </span>
          </>
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

function Rows({
  ctx,
  data,
  index,
  locale,
}: Omit<CardProps, "current" | "onHowTo" | "name" | "swapRef">) {
  const item = ctx.plan.items[index]!;
  const exercise = data.library.find((e) => e.id === item.exerciseId);
  const timed = isTimed(item, exercise);
  const showKg = !timed && exercise?.externalLoad !== false;
  const previous = previousSets(data, item.exerciseId, ctx.sessionId);
  const planned = setCount(item);
  const [added, setAdded] = useState<Record<number, Seed>>({});
  const [fresh, setFresh] = useState<number | null>(null);
  // T-0478 AC-2: a logged row stays keyed by `itemIndex` alone, never by `item.exerciseId`, so a
  // set logged before a swap keeps showing after it (`item.exerciseId` is now the new exercise).
  const loggedHere = ctx.loggedSets.filter((s) => s.itemIndex === index);
  // Planned positions, then every logged set above them and every added row (D-0142 §3).
  const rows: number[] = Array.from(
    new Set([
      ...Array.from({ length: planned }, (_, i) => i),
      ...loggedHere.filter((s) => s.setIndex >= planned).map((s) => s.setIndex),
      ...Object.keys(added).map(Number),
    ]),
  ).sort((a, b) => a - b);
  const lastIndex = rows[rows.length - 1] ?? -1;
  /** The values a row opens with: its logged values, else its seed, else the engine pre-fill. */
  const valuesOf = (i: number): Seed => {
    const done = loggedHere.find((s) => s.setIndex === i);
    if (done) return { weightKg: done.weightKg, reps: done.reps, durationS: done.durationS };
    const seed = added[i];
    if (seed) return seed;
    if (item.backoff !== null && i >= item.sets && i < planned) {
      return { weightKg: item.backoff.weightKg, reps: item.backoff.reps, durationS: null };
    }
    return {
      weightKg: item.prefill.weightKg,
      reps: item.prefill.reps ?? item.repsMin,
      durationS: item.prefill.durationS ?? item.durationS,
    };
  };
  const addSet = () => {
    const next = 1 + Math.max(planned - 1, ...loggedHere.map((s) => s.setIndex), lastIndex);
    setAdded((a) => ({ ...a, [next]: valuesOf(lastIndex) }));
    setFresh(next);
  };
  return (
    <>
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
            // T-0478 AC-2: a row logged under a different exerciseId than the card's current one
            // (a set done before a swap) shows that exercise's library name as a tag.
            const done = loggedHere.find((s) => s.setIndex === i);
            const tagName =
              done && done.exerciseId !== item.exerciseId
                ? (data.library.find((e) => e.id === done.exerciseId)?.name ?? done.exerciseId)
                : null;
            return (
              <SetRow
                key={i}
                ctx={ctx}
                item={item}
                index={index}
                i={i}
                backoff={item.backoff !== null && i >= item.sets && i < planned}
                timed={timed}
                showKg={showKg}
                locale={locale}
                prevText={prevText}
                tagName={tagName}
                seed={added[i] ?? null}
                focusOnMount={fresh === i}
                keepRow={i >= planned ? (seed) => setAdded((a) => ({ ...a, [i]: seed })) : null}
              />
            );
          })}
        </tbody>
      </table>
      <button type="button" className="wl-uf03-list__button" onClick={addSet}>
        {uf03.addSet}
      </button>
    </>
  );
}

/** T-0478, D-0162 §3: "Try again" remounts the boundary and the lazy sheet under a fresh key —
 *  the lazy was already made again by the boundary's own `componentDidCatch` (`swapSheetLoader.
 *  reset()`), so the remount imports again rather than replaying the cached rejection. */
function useSwapRetry() {
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  return { key: attempt, onRetry: retry };
}

function Card({ ctx, data, index, locale, current, onHowTo, name, swapRef }: CardProps) {
  const item = ctx.plan.items[index]!;
  const [swapping, setSwapping] = useState(false);
  if (!current && swapping) setSwapping(false);
  // T-0478 AC-3: focus returns to the Swap button after Cancel or a resolved Apply closes the
  // sheet (D-0172 §3). A mount that never opened the sheet (swapping always false) never fires.
  const wasSwapping = useRef(false);
  useEffect(() => {
    if (wasSwapping.current && !swapping) swapRef.current?.focus();
    wasSwapping.current = swapping;
  }, [swapping, swapRef]);
  const { key: retryKey, onRetry } = useSwapRetry();
  const SwapSheet = swapSheetLoader.Component;
  const closeSwap = () => setSwapping(false);
  return (
    <>
      <p className="wl-uf03-list__target">
        <span>{uf03.targetLabel}</span> <span data-part="target">{itemSummary(item)}</span>
      </p>
      {current && !swapping ? <Cue exerciseId={item.exerciseId} /> : null}
      {current && !swapping ? (
        <button type="button" className="wl-uf03-list__button" onClick={onHowTo}>
          {uf03.howToAction}
        </button>
      ) : null}
      {current ? (
        <SwapButton name={name} swapRef={swapRef} onOpen={() => setSwapping(true)} />
      ) : null}
      {current && swapping ? (
        <SwapLoadBoundary key={retryKey} onClose={closeSwap} onRetry={onRetry}>
          <Suspense fallback={null}>
            <SwapSheet
              workout={ctx.workout}
              itemIndex={index}
              timeZone={ctx.timeZone}
              onApply={async (result) => {
                await ctx.replaceItem(index, result.plan.items[index]!, result.plan.mainLiftId);
                setSwapping(false);
              }}
              onClose={closeSwap}
            />
          </Suspense>
        </SwapLoadBoundary>
      ) : (
        <Rows ctx={ctx} data={data} index={index} locale={locale} />
      )}
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

/** UF-03.2's "Rest · {m:ss} left" bar (T-0418 AC-1, AC-4): a button that opens the rest view.
 *  Its text and name read `ctx.rest` directly — the host re-renders this component every second
 *  (D-0111 §8), so the bar needs no timer of its own. */
function RestBar({
  rest,
  onOpen,
  openRef,
}: {
  rest: { remainingS: number };
  onOpen: () => void;
  openRef: RefObject<HTMLButtonElement | null>;
}) {
  const clock = restLabel(rest.remainingS);
  return (
    <button
      ref={openRef}
      type="button"
      className="wl-uf03-rest__bar"
      data-part="rest-bar"
      aria-label={uf03.restBarName(clock)}
      onClick={onOpen}
    >
      {uf03.restBar(clock)}
    </button>
  );
}

/** UF-03.2 (T-0418 AC-3): the bar expanded into its own screen, replacing the table while open
 *  (one `[data-screen-id]`, principle 1). No rest length or countdown of its own (principle 3,
 *  AC-1): `ctx.rest` and the host's REST_END/announcer own the clock and "10 seconds" / "Go".
 */
function RestView({
  ctx,
  rest,
  onSkip,
  onBack,
  skipRef,
}: {
  ctx: ListViewCtx;
  rest: { remainingS: number };
  onSkip: () => void;
  onBack: () => void;
  skipRef: RefObject<HTMLButtonElement | null>;
}) {
  const clock = restLabel(rest.remainingS);
  return (
    <div
      className="wl-uf03-rest"
      data-screen-id="UF-03.2"
      role="region"
      aria-label={uf03.restViewName}
    >
      <h1 className="wl-uf03-rest__title">{uf03.restViewName}</h1>
      <p className="wl-uf03-rest__clock" data-part="rest-clock">
        {uf03.restBar(clock)}
      </p>
      <div className="wl-uf03-rest__adjust">
        <button type="button" className="wl-uf03-list__button" onClick={() => ctx.adjustRest(-15)}>
          {uf03.restLess}
        </button>
        <button type="button" className="wl-uf03-list__button" onClick={() => ctx.adjustRest(15)}>
          {uf03.restMore}
        </button>
      </div>
      <button ref={skipRef} type="button" className="wl-uf03-list__primary" onClick={onSkip}>
        {uf03.skipRest}
      </button>
      <button type="button" className="wl-uf03-list__button" onClick={onBack}>
        {uf03.backToList}
      </button>
    </div>
  );
}

export function ListView({ ctx, locale }: ListViewProps) {
  const [data, setData] = useState<ListData | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [failed, setFailed] = useState(false);
  // T-0418 AC-3/AC-5: the rest view is open only while this is true. `restClose` says where
  // focus goes once it (or the effect below) closes it: "back" to the bar, "next" to the
  // current card's first unchecked row (else Finish).
  const [restOpen, setRestOpen] = useState(false);
  const restClose = useRef<"back" | "next">("next");
  const busy = useRef(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const restBarRef = useRef<HTMLButtonElement>(null);
  const restSkipRef = useRef<HTMLButtonElement>(null);
  const swapRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (restOpen) restSkipRef.current?.focus();
  }, [restOpen]);

  // T-0418 AC-5: once the rest view has left the DOM (`restOpen` false), focus moves to the
  // bar ("back") or the next step ("next"), read from the live DOM after this render has
  // committed the List view back in — the rows a moment ago didn't exist yet.
  useEffect(() => {
    if (restOpen) return;
    const root = rootRef.current;
    if (!root) return;
    if (restClose.current === "back") {
      restBarRef.current?.focus();
      return;
    }
    const card = root.querySelector<HTMLElement>('[data-part="card"][data-current]');
    const unchecked = card?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:checked)');
    if (unchecked) unchecked.focus();
    else root.querySelector<HTMLButtonElement>('[data-part="finish-open"]')?.focus();
  }, [restOpen]);

  // T-0418 AC-5: the rest view closes itself once the rest it was open for has ended — the host
  // still owns REST_END (principle 3) — and focus moves to the next step, as Skip would.
  useEffect(() => {
    if (restOpen && ctx.rest === null) {
      restClose.current = "next";
      setRestOpen(false);
    }
  }, [restOpen, ctx.rest]);

  const onSkipRest = () => {
    ctx.skipRest();
    restClose.current = "next";
    setRestOpen(false);
  };

  const onBackToList = () => {
    restClose.current = "back";
    setRestOpen(false);
  };

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

  // T-0418 AC-3: the rest view replaces the table while open — one `[data-screen-id]`.
  if (restOpen && ctx.rest) {
    return (
      <RestView
        ctx={ctx}
        rest={ctx.rest}
        onSkip={onSkipRest}
        onBack={onBackToList}
        skipRef={restSkipRef}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="wl-uf03-list"
      data-screen-id="UF-03.1"
      role="region"
      aria-labelledby={headingId}
    >
      <h1 id={headingId} className="wl-uf03-list__title">
        {uf03.listViewName}
      </h1>
      {ctx.rest ? (
        <RestBar rest={ctx.rest} onOpen={() => setRestOpen(true)} openRef={restBarRef} />
      ) : null}
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
            data-part="finish-open"
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
            // T-0478: counts every logged set at this position, including one logged under an
            // exercise the card has since swapped away from (consistent with `Rows`).
            const done = ctx.loggedSets.filter((s) => s.itemIndex === index).length;
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
                    name={name}
                    swapRef={swapRef}
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
