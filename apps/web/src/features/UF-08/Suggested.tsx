// UF-08.2 Suggested workout (T-0303b, D-0065 §4, D-0109). Principle 3: everything on this screen
// is the engine's `Workout`, rendered as it is. The rows are `plan.items` in plan order with the
// engine's sets, reps, pre-fill and reasons; the bar is the engine's seconds; the chips are
// `sessionReasonChips(sessionReasons)`. Shuffle and a time chip never edit the plan here: each asks the
// host to re-run `suggest()` once with new inputs (D-0109 §1-§2). Remove asks the host for the
// engine's `removeItem` (T-0521, D-0191 §4): no suggest call, no refill.
//
// The `workout` prop is the host's current `Workout`; nothing on this screen calls `suggest`.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  WARMUP_COST_S,
  availableS,
  type Area,
  type LibraryExercise,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import { itemReasonLine, itemSummary, sessionReasonChips } from "../../lib/i18n/workout.js";
import { CHIPS } from "./time.js";
import { formatKg } from "../../lib/format/number.js";
import { ExcludedAreasNotice } from "../../components/excluded-areas-notice/index.js";
import { ExerciseHowTo } from "../UF-04/index.js";
import { AddExerciseSheet } from "./AddExerciseSheet.js";
import { RemovedLine } from "./RemovedLine.js";
import { exerciseName, isBodyweight, type LibraryLookup } from "./rows.js";

export interface SuggestedProps {
  workout: Workout;
  /** The library the plan was built from: names and `externalLoad` only. */
  library: LibraryLookup;
  /** For every kg value, through `lib/format` `formatKg` (D-0124). */
  locale: string;
  /** The areas skipped today (T-0520, D-0191), in the fixed order. Shown as one line; no control. */
  avoidAreas?: readonly Area[];
  /** The plan is empty because Remove took its last row (T-0521): "No exercises left". */
  emptiedByRemove?: boolean;
  /**
   * Remove one item: the host calls the engine's `removeItem` (nothing refills the slot) and adds
   * the id to `excludeIds`. Returns whether a new plan was set (false when it was rejected).
   */
  onRemove: (exerciseId: string) => boolean;
  /** The host re-suggests with `shuffle + 1`. */
  onShuffle: () => void;
  /** The host re-suggests at `budgetMin`. Only called for a chip that isn't the active one. */
  onBudget: (budgetMin: number) => void;
  /** Areas the stored list leaves empty (engine `excludedOutAreas`); the neutral notice. */
  noticeAreas?: readonly Area[];
  /** Ids removed on this visit, in tap order (the Removed line). */
  removedIds?: readonly string[];
  /** The stored exclusions (cache) and the online flag, for the Removed line's controls. */
  storedIds?: readonly string[];
  online?: boolean;
  onExclude?: ((exerciseId: string) => Promise<void>) | undefined;
  onInclude?: ((exerciseId: string) => Promise<void>) | undefined;
  /** The item row whose Swap button takes focus on mount (after leaving UF-08.3, T-0303c). */
  focusSwapItem?: number | null;
  /** Called once that focus has moved. */
  onSwapFocused?: () => void;
  /** T-0573: ids added on this visit, in add order (D-0205). Their reason line is "Added by you". */
  addedIds?: readonly string[];
  /** The full library, for UF-08.5's search. With `onAdd`, shows "Add exercise". */
  catalog?: readonly LibraryExercise[];
  /** The host's Add: null when the exercise is now in the plan, else the refusal text. */
  onAdd?: (exerciseId: string) => string | null;
}

/** UF-08.5 is open while the current history entry carries this state; the URL never changes. */
const SHEET_STATE = "wlAddSheet";

const READY_HREF = "/session/setup?step=ready";

function minutesOf(seconds: number): number {
  return Math.ceil(seconds / 60);
}

function itemDetail(item: WorkoutItem, library: LibraryLookup, locale: string): string {
  const parts = [itemSummary(item)];
  if (isBodyweight(item.exerciseId, library)) parts.push(en.uf08.bodyweight);
  else if (item.prefill.weightKg !== null) {
    parts.push(formatKg(item.prefill.weightKg, locale));
  }
  parts.push(en.uf08.rowMinutes(minutesOf(item.costS)));
  return en.uf08.rowDetail(parts);
}

function backoffLine(item: WorkoutItem, locale: string): string | null {
  if (item.backoff === null) return null;
  if (item.backoff.weightKg === null) return en.uf08.backoffSet;
  return en.uf08.backoff(formatKg(item.backoff.weightKg, locale), item.backoff.reps);
}

/** One bar segment. Its `flex-grow` is data (seconds), so it is set on the node; the over-budget
 *  colour is the `--warn` class (uf-08.css). */
function Segment({ kind, seconds, warn }: { kind: string; seconds: number; warn: boolean }) {
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (el) el.style.flexGrow = String(seconds);
    },
    [seconds],
  );
  return (
    <span
      ref={ref}
      className={warn ? "wl-uf08__seg wl-uf08__seg--warn" : "wl-uf08__seg"}
      data-segment={kind}
    />
  );
}

/** The bar and its text (D-0109 §5). */
function BudgetBar({ workout }: { workout: Workout }) {
  const { budgetMin, warmupInBudget, itemsTotalS, totalS, unusedS } = workout;
  const available = availableS(budgetMin, warmupInBudget);
  const over = itemsTotalS > available;
  const shown = minutesOf(warmupInBudget ? totalS : itemsTotalS);
  const text = over
    ? en.uf08.budgetOver(shown, minutesOf(itemsTotalS - available), !warmupInBudget)
    : en.uf08.budgetWithin(shown, budgetMin, !warmupInBudget);
  return (
    <div className="wl-uf08__budget">
      <div className="wl-uf08__bar" data-part="bar" aria-hidden="true">
        {warmupInBudget ? <Segment kind="warmup" seconds={WARMUP_COST_S} warn={false} /> : null}
        {workout.plan.items.map((item) => (
          <Segment key={item.exerciseId} kind="item" seconds={item.costS} warn={over} />
        ))}
        {unusedS > 0 ? <Segment kind="unused" seconds={unusedS} warn={false} /> : null}
      </div>
      <p className="wl-uf08__budget-text" data-part="budget-text" aria-live="polite">
        {text}
      </p>
    </div>
  );
}

export function Suggested({
  workout,
  library,
  locale,
  avoidAreas = [],
  emptiedByRemove = false,
  noticeAreas = [],
  removedIds = [],
  storedIds = [],
  online = true,
  onExclude,
  onInclude,
  onRemove,
  onShuffle,
  onBudget,
  focusSwapItem = null,
  onSwapFocused,
  addedIds = [],
  catalog,
  onAdd,
}: SuggestedProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const sheetOpen =
    (location.state as Record<string, unknown> | null)?.[SHEET_STATE] === true &&
    onAdd !== undefined;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The id just added: focus goes to its row when the sheet has closed.
  const pendingAddFocus = useRef<string | null>(null);
  const sheetWasOpen = useRef(false);
  // Set once a close (Escape, Close, Add) has navigated back, so a second one can't pop again.
  const closing = useRef(false);
  const [status, setStatus] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const looksGoodRef = useRef<HTMLButtonElement>(null);
  // D-0109 §6: the index of the row whose Remove was used, until the new plan has rendered.
  const pendingFocus = useRef<number | null>(null);
  // T-0581: the exercise whose how-to sheet is open. UI state only; the plan is never touched.
  const [howToId, setHowToId] = useState<string | null>(null);

  const chips = useMemo(() => sessionReasonChips(workout.sessionReasons), [workout.sessionReasons]);
  const items = workout.plan.items;
  const warmupNames = workout.plan.warmup.map((w) => exerciseName(w.exerciseId, library));

  // UF-08.3 → UF-08.2 (Keep or Apply): focus returns to the Swap button of the row it came from.
  useEffect(() => {
    if (focusSwapItem === null) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-part="swap"]');
    buttons?.[focusSwapItem]?.focus();
    onSwapFocused?.();
    // Mount only: the host clears the request through `onSwapFocused`.
  }, []);

  // Opening pushes an entry with the same URL, so browser Back closes it. When it closes, focus
  // goes to the new row after an Add, else back to "Add exercise" (UF-08.5.md, States and focus).
  useEffect(() => {
    if (sheetWasOpen.current === sheetOpen) return;
    sheetWasOpen.current = sheetOpen;
    closing.current = false;
    if (sheetOpen) return;
    const id = pendingAddFocus.current;
    pendingAddFocus.current = null;
    const row =
      id === null
        ? null
        : listRef.current?.querySelector<HTMLElement>(
            `[data-id="${CSS.escape(id)}"] [data-part="row-name"]`,
          );
    (row ?? addButtonRef.current)?.focus();
  }, [sheetOpen]);

  const notFitting = addedIds.filter((id) => !items.some((i) => i.exerciseId === id));
  const notFittingText =
    notFitting.length === 0
      ? ""
      : en.uf08.doesntFit(
          workout.budgetMin,
          notFitting.map((id) => exerciseName(id, library)),
        );
  // The standing line also goes to the status region, so a screen reader hears it appear.
  useEffect(() => {
    setStatus(notFittingText);
  }, [notFittingText]);

  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-part="remove"]');
    const target =
      buttons && buttons.length > 0 ? buttons[Math.min(index, buttons.length - 1)] : null;
    (target ?? looksGoodRef.current)?.focus();
  }, [workout]);

  return (
    <section data-screen-id="UF-08.2" className="wl-uf08" data-items={items.length}>
      <div className="wl-uf08__top">
        <Link className="wl-uf08__back" to="/session/setup?step=time">
          {en.uf08.back}
        </Link>
      </div>
      <h1 className="wl-uf08__title">{en.uf08.suggestedTitle}</h1>

      {chips.length > 0 ? (
        <ul
          className="wl-uf08__why"
          data-part="session-chips"
          aria-label={en.uf08.sessionChipsName}
        >
          {chips.map((chip, i) => (
            <li key={`${i}:${chip}`} className="wl-uf08__why-chip">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}

      {avoidAreas.length > 0 ? (
        <p className="wl-uf08__skipping" data-part="skipping">
          {en.uf08.skipping(avoidAreas.map((a) => en.bodyMap.areas[a]))}
        </p>
      ) : null}

      {avoidAreas.length > 0 ? <ExcludedAreasNotice areas={noticeAreas} /> : null}

      <BudgetBar workout={workout} />

      {avoidAreas.length === 0 ? <ExcludedAreasNotice areas={noticeAreas} /> : null}

      <div className="wl-uf08__chips" role="group" aria-label={en.uf08.timeChipsName}>
        {CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            className="wl-uf08__chip"
            aria-label={en.uf08.chipName(String(m))}
            aria-pressed={workout.budgetMin === m ? "true" : "false"}
            onClick={() => {
              if (m === workout.budgetMin) return;
              pendingFocus.current = null;
              setStatus("");
              onBudget(m);
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {workout.plan.warmup.length > 0 ? (
        <div className="wl-uf08__row wl-uf08__row--warmup" data-part="warmup-row">
          <div className="wl-uf08__row-body">
            <span className="wl-uf08__row-name" data-part="row-name">
              {en.uf08.warmupRow}
            </span>
            <span className="wl-uf08__row-detail" data-part="row-detail">
              {en.uf08.warmupMoves(warmupNames)}
            </span>
            <span className="wl-uf08__row-detail" data-part="row-minutes">
              {en.uf08.rowMinutes(minutesOf(WARMUP_COST_S))}
            </span>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="wl-uf08__fit" data-part="nothing-fits">
          {emptiedByRemove ? en.uf08.noneLeft : en.uf08.nothingFits(workout.budgetMin)}
        </p>
      ) : (
        <ol className="wl-uf08__rows" ref={listRef} aria-label={en.uf08.rowsName}>
          {items.map((item, index) => {
            const name = exerciseName(item.exerciseId, library);
            const reason = addedIds.includes(item.exerciseId)
              ? en.uf08.addedByYou
              : itemReasonLine(item.reasons);
            const backoff = backoffLine(item, locale);
            return (
              <li
                key={item.exerciseId}
                className="wl-uf08__row"
                data-part="item-row"
                data-id={item.exerciseId}
              >
                <div className="wl-uf08__row-body">
                  <button
                    type="button"
                    className="wl-uf08__row-name wl-uf08__row-name--button"
                    data-part="row-name"
                    aria-label={en.uf08.howTo(name)}
                    onClick={() => setHowToId(item.exerciseId)}
                  >
                    {name}
                  </button>
                  <span className="wl-uf08__row-detail" data-part="row-detail">
                    {itemDetail(item, library, locale)}
                  </span>
                  {backoff !== null ? (
                    <span className="wl-uf08__row-detail" data-part="row-backoff">
                      {backoff}
                    </span>
                  ) : null}
                  {reason !== "" ? (
                    <span className="wl-uf08__row-reason" data-part="row-reason">
                      {reason}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="wl-uf08__icon wl-uf08__icon--text"
                  data-part="swap"
                  aria-label={en.uf08.swapItem(name)}
                  onClick={() => {
                    pendingFocus.current = null;
                    void navigate(`/session/setup?step=swap&item=${index}`);
                  }}
                >
                  {en.uf08.swap}
                </button>
                <button
                  type="button"
                  className="wl-uf08__icon"
                  data-part="remove"
                  aria-label={en.uf08.remove(name)}
                  onClick={() => {
                    pendingFocus.current = index;
                    setStatus("");
                    // No new plan → no re-render to move focus for; never leave it pending.
                    if (!onRemove(item.exerciseId)) pendingFocus.current = null;
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <RemovedLine
        ids={removedIds}
        library={library}
        storedIds={storedIds}
        online={online}
        onExclude={onExclude}
        onInclude={onInclude}
      />

      {notFittingText !== "" ? (
        <p className="wl-uf08__fit" data-part="doesnt-fit">
          {notFittingText}
        </p>
      ) : null}
      <div role="status" className="wl-uf08__status" data-part="status">
        {status}
      </div>

      {onAdd !== undefined ? (
        <button
          ref={addButtonRef}
          type="button"
          className="wl-uf08__ghost wl-uf08__add"
          aria-haspopup="dialog"
          onClick={() => {
            pendingFocus.current = null;
            void navigate(`${location.pathname}${location.search}`, {
              state: { [SHEET_STATE]: true },
            });
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
          {en.uf08.addExercise}
        </button>
      ) : null}

      <div className="wl-uf08__actions">
        <button
          type="button"
          className="wl-uf08__ghost"
          onClick={() => {
            pendingFocus.current = null;
            setStatus("");
            onShuffle();
          }}
        >
          {en.uf08.shuffle}
        </button>
        <button
          ref={looksGoodRef}
          type="button"
          className="wl-uf08__primary"
          onClick={() => void navigate(READY_HREF)}
        >
          {en.uf08.looksGood}
        </button>
      </div>
      {sheetOpen && onAdd !== undefined ? (
        <AddExerciseSheet
          catalog={catalog ?? []}
          items={items}
          budgetMin={workout.budgetMin}
          onAdd={(id) => {
            if (closing.current) return null;
            const refusal = onAdd(id);
            if (refusal === null) {
              closing.current = true;
              pendingAddFocus.current = id;
              setStatus(en.uf08.added(exerciseName(id, library)));
              void navigate(-1);
            }
            return refusal;
          }}
          onClose={() => {
            if (closing.current) return;
            closing.current = true;
            void navigate(-1);
          }}
        />
      ) : null}
      {howToId !== null ? (
        <ExerciseHowTo exerciseId={howToId} onClose={() => setHowToId(null)} />
      ) : null}
    </section>
  );
}
