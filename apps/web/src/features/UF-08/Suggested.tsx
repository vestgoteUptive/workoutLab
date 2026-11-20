// UF-08.2 Suggested workout (T-0303b, D-0065 §4, D-0109). Principle 3: everything on this screen
// is the engine's `Workout`, rendered as it is. The rows are `plan.items` in plan order with the
// engine's sets, reps, pre-fill and reasons; the bar is the engine's seconds; the chips are
// `sessionReasonChips(sessionReasons)`. Shuffle and a time chip never edit the plan here: each asks the
// host to re-run `suggest()` once with new inputs (D-0109 §1-§2). Remove asks the host for the
// engine's `removeItem` (T-0521, D-0191 §4): no suggest call, no refill.
//
// The `workout` prop is the host's current `Workout`; nothing on this screen calls `suggest`.
//
// T-0940 empty mode (D-0236, D-0239 §6-§13, UF-08.2.md › Empty mode): the budget line reads
// "{used} of {n} min · {left} min left" and is not live (the status line is the one region for
// the messages), 0 items show the empty-plan line and an `aria-disabled` "Looks good", and Shuffle
// is replaced by "Other suggestions" inside the Suggestions section (T-0941, D-0238, D-0239 §8-§10):
// rows with Add, the list copies, "Other suggestions" and "Fill the rest for me"; a refusal shows in
// the status line and focus follows D-0239 §10. The host computes the list; this file renders it.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import { ArrowIcon, CrossIcon, DragHandleIcon } from "../../components/icons/index.js";
import { ExcludedAreasNotice } from "../../components/excluded-areas-notice/index.js";
import { ExerciseHowTo } from "../UF-04/index.js";
import { AddExerciseSheet } from "./AddExerciseSheet.js";
import { RemovedLine } from "./RemovedLine.js";
import { exerciseName, isBodyweight, type LibraryLookup } from "./rows.js";
import { leftMinutes, overMinutes, usedMinutes } from "./budget.js";
import type { SuggestionList } from "./suggestions.js";

export interface SuggestedProps {
  /** T-0940 (D-0236 §2): the visit's planning mode; absent is "suggested". */
  mode?: "suggested" | "empty";
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
  /** T-0580: the swap on UF-08.3 was applied but its "Don't suggest again" write failed. */
  exclusionFailed?: boolean;
  onExclude?: ((exerciseId: string) => Promise<void>) | undefined;
  onInclude?: ((exerciseId: string) => Promise<void>) | undefined;
  /** The item row whose Swap button takes focus on mount (after leaving UF-08.3, T-0303c). */
  focusSwapItem?: number | null;
  /** Called once that focus has moved. */
  onSwapFocused?: () => void;
  /** T-0573: ids added on this visit, in add order (D-0205). Their reason line is "Added by you". */
  addedIds?: readonly string[];
  /**
   * T-0940 (D-0239 §1): the ids the visit keeps (the main pick, then the pins) that a re-suggest
   * may have left out; each one missing from the plan is named in "Doesn't fit in {n} min: …".
   * Absent means `addedIds`.
   */
  keptIds?: readonly string[];
  /** The full library, for UF-08.5's search. With `onAdd`, shows "Add exercise". */
  catalog?: readonly LibraryExercise[];
  /** T-0574: exercise id to the reason its Add is disabled on UF-08.5. */
  blocked?: Readonly<Record<string, string>>;
  /** T-0577: stored favorite ids for UF-08.5's Favorites section, and whether they have loaded. */
  favoriteIds?: readonly string[];
  favoritesLoaded?: boolean;
  /** The host's Add: null when the exercise is now in the plan, else the refusal text. */
  onAdd?: (exerciseId: string) => string | null;
  /** T-0575: "Start with this" (D-0205 §5): null when `id` is now the main lift, else the refusal. */
  onStartWith?: (exerciseId: string) => string | null;
  /** T-0576 (D-0205 §7): move an item one place in the display order; no `suggest` call. */
  onMove?: (exerciseId: string, delta: -1 | 1) => void;
  /** T-0941: empty mode's Suggestions list; absent shows no section. */
  suggestions?: SuggestionList;
  /** A suggestion's Add: null when it is in the plan now, else the refusal for the status line. */
  onAddSuggestion?: (exerciseId: string, asMain: boolean) => string | null;
  /** "Other suggestions": the host bumps the visit's shuffle, changing only the suggestions. */
  onOtherSuggestions?: () => void;
  /** "Fill the rest for me": null when the visit is in suggested mode now, else the refusal. */
  onFillRest?: () => string | null;
}

/** T-0941 (D-0239 §10): where focus goes once the host's new state has rendered. */
type SuggestFocus = { kind: "add"; index: number } | { kind: "other" } | { kind: "fill" };

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

/** One bar segment. Its `flex-grow` is data (seconds), so it is set on the node. */
function Segment({ kind, seconds }: { kind: string; seconds: number }) {
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (el) el.style.flexGrow = String(seconds);
    },
    [seconds],
  );
  return <span ref={ref} className="wl-uf08__seg" data-segment={kind} />;
}

/**
 * The bar and its text (D-0109 §5). Empty mode (D-0239 §6-§7, §9): "{used} of {n} min · {left} min
 * left" (or "· {over} min over"), and no `aria-live`; the bar itself is the same in both modes.
 */
function BudgetBar({ workout, empty }: { workout: Workout; empty: boolean }) {
  const { budgetMin, warmupInBudget, itemsTotalS, totalS, unusedS } = workout;
  const available = availableS(budgetMin, warmupInBudget);
  const over = itemsTotalS > available;
  const shown = minutesOf(warmupInBudget ? totalS : itemsTotalS);
  const text = empty
    ? over
      ? en.uf08.budgetOverBy(usedMinutes(workout), budgetMin, overMinutes(workout), !warmupInBudget)
      : en.uf08.budgetLeft(usedMinutes(workout), budgetMin, leftMinutes(workout), !warmupInBudget)
    : over
      ? en.uf08.budgetOver(shown, minutesOf(itemsTotalS - available), !warmupInBudget)
      : en.uf08.budgetWithin(shown, budgetMin, !warmupInBudget);
  return (
    <div className="wl-uf08__budget" data-over={over ? "true" : undefined}>
      <div className="wl-uf08__bar" data-part="bar" aria-hidden="true">
        {warmupInBudget ? <Segment kind="warmup" seconds={WARMUP_COST_S} /> : null}
        {workout.plan.items.map((item) => (
          <Segment key={item.exerciseId} kind="item" seconds={item.costS} />
        ))}
        {unusedS > 0 ? <Segment kind="unused" seconds={unusedS} /> : null}
      </div>
      <p
        className="wl-uf08__budget-text"
        data-part="budget-text"
        aria-live={empty ? undefined : "polite"}
      >
        {text}
      </p>
    </div>
  );
}

export function Suggested({
  mode = "suggested",
  workout,
  library,
  locale,
  avoidAreas = [],
  emptiedByRemove = false,
  noticeAreas = [],
  removedIds = [],
  storedIds = [],
  online = true,
  exclusionFailed = false,
  onExclude,
  onInclude,
  onRemove,
  onShuffle,
  onBudget,
  focusSwapItem = null,
  onSwapFocused,
  addedIds = [],
  keptIds,
  catalog,
  blocked,
  favoriteIds,
  favoritesLoaded,
  onAdd,
  onStartWith,
  onMove,
  suggestions,
  onAddSuggestion,
  onOtherSuggestions,
  onFillRest,
}: SuggestedProps) {
  const empty = mode === "empty";
  const favSet = new Set(favoriteIds ?? []);
  const needOneId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const sheetOpen =
    (location.state as Record<string, unknown> | null)?.[SHEET_STATE] === true &&
    onAdd !== undefined;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The id just added: focus goes to its row when the sheet has closed.
  const pendingAddFocus = useRef<string | null>(null);
  // T-0940 (D-0239 §9): the name just added in empty mode; its status needs the new plan's time.
  const pendingAddStatus = useRef<string | null>(null);
  // T-0575: the row to focus after a row-level "Start with this" (no sheet to close).
  const pendingStartFocus = useRef<string | null>(null);
  const sheetWasOpen = useRef(false);
  // Set once a close (Escape, Close, Add) has navigated back, so a second one can't pop again.
  const closing = useRef(false);
  const [status, setStatus] = useState("");
  const suggestionsId = useId();
  const suggestionsRef = useRef<HTMLElement>(null);
  const otherRef = useRef<HTMLButtonElement>(null);
  const pendingSuggestFocus = useRef<SuggestFocus | null>(null);
  // T-0576: Reorder mode is UI state of this screen; it never outlives it.
  const [reorder, setReorder] = useState(false);
  // The row that was just moved, shown raised until Done.
  const [movedId, setMovedId] = useState<string | null>(null);
  const reorderButtonRef = useRef<HTMLButtonElement>(null);
  const pendingMoveFocus = useRef<{ id: string; part: "move-up" | "move-down" } | null>(null);
  const reorderChanged = useRef(false);
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

  const notFitting = (keptIds ?? addedIds).filter((id) => !items.some((i) => i.exerciseId === id));
  const notFittingText =
    notFitting.length === 0
      ? ""
      : en.uf08.doesntFit(
          workout.budgetMin,
          notFitting.map((id) => exerciseName(id, library)),
        );
  // The standing line also goes to the status region, so a screen reader hears it appear.
  // A successful action sets its own confirmation in the same batch that changes the list; the
  // standing line must not overwrite it (T-0940 QA). Cleared once the new plan has rendered.
  const keepActionStatus = useRef(false);
  useEffect(() => {
    if (keepActionStatus.current) return;
    setStatus(notFittingText);
  }, [notFittingText]);
  useEffect(() => {
    keepActionStatus.current = false;
  }, [workout]);

  // Empty mode: "{name} added. {left} min left." with the new plan's `unusedS` (D-0239 §9).
  useEffect(() => {
    const name = pendingAddStatus.current;
    if (name === null) return;
    pendingAddStatus.current = null;
    setStatus(en.uf08.addedLeft(name, leftMinutes(workout)));
  }, [workout]);

  // D-0239 §10: after a suggestion Add, focus goes to the Add of the row now in the tapped row's
  // place (the new last row when it was last), else "Add exercise"; "Other suggestions" keeps it
  // unless it has gone; "Fill the rest for me" ends on "Add exercise". Never `body`.
  useEffect(() => {
    const pending = pendingSuggestFocus.current;
    if (pending === null) return;
    pendingSuggestFocus.current = null;
    const adds = suggestionsRef.current?.querySelectorAll<HTMLElement>('[data-part="suggest-add"]');
    const target =
      pending.kind === "add"
        ? adds && adds.length > 0
          ? adds[Math.min(pending.index, adds.length - 1)]
          : null
        : pending.kind === "other"
          ? otherRef.current
          : null;
    (target ?? addButtonRef.current)?.focus();
  }, [workout, suggestions, mode]);

  useEffect(() => {
    const id = pendingStartFocus.current;
    if (id === null) return;
    pendingStartFocus.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] [data-part="row-name"]`)
      ?.focus();
  }, [workout]);

  // Focus: entering goes to the first Move control; a move keeps the same button on the moved row,
  // or the other one where it has disappeared (first row: no Move up, last: no Move down).
  useEffect(() => {
    if (!reorderChanged.current) return;
    reorderChanged.current = false;
    if (reorder) {
      listRef.current?.querySelector<HTMLElement>('[data-part^="move-"]')?.focus();
    } else reorderButtonRef.current?.focus();
  }, [reorder]);

  useEffect(() => {
    const pending = pendingMoveFocus.current;
    if (pending === null) return;
    pendingMoveFocus.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(pending.id)}"]`,
    );
    const other = pending.part === "move-up" ? "move-down" : "move-up";
    (
      row?.querySelector<HTMLElement>(`[data-part="${pending.part}"]`) ??
      row?.querySelector<HTMLElement>(`[data-part="${other}"]`)
    )?.focus();
  }, [workout]);

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
    <section
      data-screen-id="UF-08.2"
      data-wl-state="plan"
      className="wl-uf08 wl-page"
      data-items={items.length}
    >
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
            <li key={`${i}:${chip}`} className="wl-chip wl-uf08__why-chip">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}

      {avoidAreas.length > 0 ? (
        <p className="wl-uf08__skipping" data-part="skipping">
          <svg
            className="wl-uf08__skipping-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
          </svg>
          <span>{en.uf08.skipping(avoidAreas.map((a) => en.bodyMap.areas[a]))}</span>
        </p>
      ) : null}

      {avoidAreas.length > 0 ? <ExcludedAreasNotice areas={noticeAreas} /> : null}

      <BudgetBar workout={workout} empty={empty} />

      {avoidAreas.length === 0 ? <ExcludedAreasNotice areas={noticeAreas} /> : null}

      {reorder ? null : (
        <div className="wl-uf08__chips" role="group" aria-label={en.uf08.timeChipsName}>
          {CHIPS.map((m) => (
            <button
              key={m}
              type="button"
              className="wl-chip wl-uf08__chip"
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
      )}

      {(onMove !== undefined && items.length >= 2) || (empty && !reorder) ? (
        <div className="wl-uf08__list-head" data-part="list-head">
          {empty && !reorder ? (
            <h2 className="wl-uf08__list-title" data-part="list-title">
              {en.uf08.exercisesHeading}
            </h2>
          ) : null}
          {reorder ? (
            <>
              <h2 className="wl-uf08__list-title">{en.uf08.reorder}</h2>
              <button
                type="button"
                className="wl-button--secondary wl-uf08__list-button"
                data-part="reorder-done"
                onClick={() => {
                  reorderChanged.current = true;
                  setMovedId(null);
                  setReorder(false);
                }}
              >
                {en.uf08.reorderDone}
              </button>
            </>
          ) : onMove !== undefined && items.length >= 2 ? (
            <button
              ref={reorderButtonRef}
              type="button"
              className="wl-button--secondary wl-uf08__list-button"
              data-part="reorder"
              onClick={() => {
                pendingFocus.current = null;
                reorderChanged.current = true;
                setReorder(true);
              }}
            >
              {en.uf08.reorder}
            </button>
          ) : null}
        </div>
      ) : null}

      {workout.plan.warmup.length > 0 ? (
        <div className="wl-row wl-uf08__row wl-uf08__row--warmup" data-part="warmup-row">
          <span className="wl-uf08__index" aria-hidden="true" />
          <div className="wl-uf08__row-body">
            <span className="wl-uf08__row-name wl-type-row-title" data-part="row-name">
              {en.uf08.warmupRow}
            </span>
            <span className="wl-uf08__row-detail wl-type-label" data-part="row-detail">
              {en.uf08.warmupMoves(warmupNames)}
            </span>
            <span className="wl-uf08__row-detail wl-type-label" data-part="row-minutes">
              {en.uf08.rowMinutes(minutesOf(WARMUP_COST_S))}
            </span>
          </div>
        </div>
      ) : null}

      {items.length === 0 && empty ? (
        <p className="wl-uf08__hint" data-part="empty-plan">
          {en.uf08.emptyPlan}
        </p>
      ) : items.length === 0 ? (
        <p className="wl-uf08__fit" data-part="nothing-fits">
          {emptiedByRemove ? en.uf08.noneLeft : en.uf08.nothingFits(workout.budgetMin)}
        </p>
      ) : (
        <ol
          className="wl-uf08__rows"
          ref={listRef}
          aria-label={en.uf08.rowsName}
          data-reorder={reorder ? "true" : undefined}
        >
          {items.map((item, index) => {
            const name = exerciseName(item.exerciseId, library);
            const reason = addedIds.includes(item.exerciseId)
              ? en.uf08.addedByYou
              : itemReasonLine(item.reasons);
            const backoff = backoffLine(item, locale);
            if (reorder) {
              const move = (delta: -1 | 1, part: "move-up" | "move-down") => {
                pendingMoveFocus.current = { id: item.exerciseId, part };
                setStatus(en.uf08.moved(name, index + delta + 1, items.length));
                setMovedId(item.exerciseId);
                onMove?.(item.exerciseId, delta);
              };
              return (
                <li
                  key={item.exerciseId}
                  className="wl-row wl-uf08__row wl-uf08__row--reorder"
                  data-part="item-row"
                  data-id={item.exerciseId}
                  data-main={item.isMain ? "true" : undefined}
                  data-moved={movedId === item.exerciseId ? "true" : undefined}
                >
                  <DragHandleIcon className="wl-uf08__handle" />
                  <div className="wl-uf08__row-body">
                    <span className="wl-uf08__row-name wl-type-row-title" data-part="row-name">
                      {name}
                    </span>
                    <span className="wl-uf08__row-detail wl-type-label" data-part="row-detail">
                      {itemSummary(item)}
                    </span>
                    {favSet.has(item.exerciseId) ? (
                      <span className="wl-chip wl-uf08__tag" data-part="row-favorite">
                        {en.uf08.favoriteTag}
                      </span>
                    ) : null}
                  </div>
                  {index > 0 ? (
                    <button
                      type="button"
                      className="wl-button--text wl-uf08__icon wl-uf08__icon--text"
                      data-part="move-up"
                      aria-label={en.uf08.moveUpName(name)}
                      onClick={() => move(-1, "move-up")}
                    >
                      {en.uf08.moveUp}
                    </button>
                  ) : null}
                  {index < items.length - 1 ? (
                    <button
                      type="button"
                      className="wl-button--text wl-uf08__icon wl-uf08__icon--text"
                      data-part="move-down"
                      aria-label={en.uf08.moveDownName(name)}
                      onClick={() => move(1, "move-down")}
                    >
                      {en.uf08.moveDown}
                    </button>
                  ) : null}
                </li>
              );
            }
            return (
              <li
                key={item.exerciseId}
                className="wl-row wl-uf08__row"
                data-part="item-row"
                data-id={item.exerciseId}
                data-main={item.isMain ? "true" : undefined}
              >
                <span className="wl-uf08__index wl-type-label" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="wl-uf08__row-body">
                  <button
                    type="button"
                    className="wl-uf08__row-name wl-uf08__row-name--button wl-type-row-title"
                    data-part="row-name"
                    aria-label={en.uf08.howTo(name)}
                    onClick={() => setHowToId(item.exerciseId)}
                  >
                    {name}
                  </button>
                  <span className="wl-uf08__row-detail wl-type-label" data-part="row-detail">
                    {itemDetail(item, library, locale)}
                  </span>
                  {backoff !== null ? (
                    <span className="wl-uf08__row-detail wl-type-label" data-part="row-backoff">
                      {backoff}
                    </span>
                  ) : null}
                  {(item.isMain && addedIds.includes(item.exerciseId)) ||
                  favSet.has(item.exerciseId) ? (
                    <span className="wl-uf08__tags">
                      {item.isMain && addedIds.includes(item.exerciseId) ? (
                        <span className="wl-chip wl-uf08__tag" data-part="row-main">
                          {en.uf08.mainTag}
                        </span>
                      ) : null}
                      {favSet.has(item.exerciseId) ? (
                        <span className="wl-chip wl-uf08__tag" data-part="row-favorite">
                          {en.uf08.favoriteTag}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {reason !== "" ? (
                    <span className="wl-uf08__row-detail wl-type-label" data-part="row-reason">
                      {reason}
                    </span>
                  ) : null}
                </div>
                <div className="wl-uf08__row-actions">
                  {onStartWith !== undefined &&
                  !item.isMain &&
                  catalog?.find((l) => l.id === item.exerciseId)?.type === "compound" ? (
                    <button
                      type="button"
                      className="wl-button--text wl-uf08__icon wl-uf08__icon--text"
                      data-part="start-with"
                      aria-label={en.uf08.startWithName(name)}
                      onClick={() => {
                        pendingFocus.current = null;
                        const refusal = onStartWith(item.exerciseId);
                        if (refusal === null) {
                          pendingStartFocus.current = item.exerciseId;
                          keepActionStatus.current = true;
                          setStatus(en.uf08.mainNow(name));
                        } else setStatus(refusal);
                      }}
                    >
                      {en.uf08.startWith}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="wl-button--text wl-uf08__icon wl-uf08__icon--text"
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
                    <CrossIcon size={20} />
                  </button>
                </div>
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
      <div aria-live="assertive" data-part="exclusion-failed">
        {exclusionFailed ? (
          <p role="alert" className="wl-uf08__status">
            {en.excluded.saveFailed}
          </p>
        ) : null}
      </div>
      <div role="status" className="wl-uf08__status" data-part="status">
        {status}
      </div>

      {empty && !reorder && suggestions !== undefined && onAddSuggestion !== undefined ? (
        <section
          ref={suggestionsRef}
          className="wl-uf08__suggest"
          data-part="suggestions"
          aria-labelledby={suggestionsId}
        >
          <h2 id={suggestionsId} className="wl-uf08__list-title" data-part="suggestions-title">
            {en.uf08.suggestionsHeading}
          </h2>
          {suggestions.kind === "rows" ? (
            <>
              <p className="wl-uf08__hint" data-part="suggestions-sub">
                {en.uf08.suggestionsSub(leftMinutes(workout))}
              </p>
              <ul className="wl-uf08__suggest-list">
                {suggestions.rows.map((item, index) => {
                  const name = exerciseName(item.exerciseId, library);
                  const reason = itemReasonLine(item.reasons);
                  return (
                    <li
                      key={item.exerciseId}
                      className="wl-row wl-uf08__row wl-uf08__suggest-row"
                      data-part="suggestion"
                      data-id={item.exerciseId}
                    >
                      <div className="wl-uf08__row-body">
                        <span className="wl-uf08__row-name wl-type-row-title" data-part="row-name">
                          {name}
                        </span>
                        {item.isMain || favSet.has(item.exerciseId) ? (
                          <span className="wl-uf08__tags">
                            {item.isMain ? (
                              <span className="wl-chip wl-uf08__tag" data-part="row-main">
                                {en.uf08.mainTag}
                              </span>
                            ) : null}
                            {favSet.has(item.exerciseId) ? (
                              <span className="wl-chip wl-uf08__tag" data-part="row-favorite">
                                {en.uf08.favoriteTag}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        <span className="wl-uf08__row-detail wl-type-label" data-part="row-detail">
                          {itemDetail(item, library, locale)}
                        </span>
                        {reason !== "" ? (
                          <span
                            className="wl-uf08__row-detail wl-type-label"
                            data-part="row-reason"
                          >
                            {reason}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="wl-button--secondary wl-uf08__suggest-add"
                          data-part="suggest-add"
                          aria-label={en.uf08.addName(name)}
                          onClick={() => {
                            pendingFocus.current = null;
                            // D-0239 §9: the confirmation needs the new plan's minutes left.
                            pendingAddStatus.current = name;
                            keepActionStatus.current = true;
                            const refusal = onAddSuggestion(item.exerciseId, item.isMain);
                            if (refusal === null) {
                              pendingSuggestFocus.current = { kind: "add", index };
                            } else {
                              // D-0239 §12: shown here, focus stays on the tapped button.
                              pendingAddStatus.current = null;
                              keepActionStatus.current = false;
                              setStatus(refusal);
                            }
                          }}
                        >
                          {en.uf08.add}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="wl-uf08__hint" data-part="suggestions-copy">
              {suggestions.kind === "over"
                ? en.uf08.suggestionsOver(suggestions.over, workout.budgetMin)
                : suggestions.kind === "full"
                  ? en.uf08.suggestionsFull(workout.budgetMin)
                  : en.uf08.suggestionsNone}
            </p>
          )}
          {suggestions.kind === "rows" && onOtherSuggestions !== undefined ? (
            <button
              ref={otherRef}
              type="button"
              className="wl-button--secondary wl-uf08__suggest-other"
              data-part="other-suggestions"
              onClick={() => {
                pendingFocus.current = null;
                setStatus("");
                pendingSuggestFocus.current = { kind: "other" };
                onOtherSuggestions();
              }}
            >
              {en.uf08.otherSuggestions}
            </button>
          ) : null}
          {suggestions.kind !== "none" && onFillRest !== undefined ? (
            <button
              type="button"
              className="wl-button--text wl-uf08__suggest-fill"
              data-part="fill-rest"
              onClick={() => {
                pendingFocus.current = null;
                const refusal = onFillRest();
                if (refusal === null) {
                  setStatus("");
                  pendingSuggestFocus.current = { kind: "fill" };
                } else setStatus(refusal);
              }}
            >
              {en.uf08.fillRest}
            </button>
          ) : null}
        </section>
      ) : null}

      {onAdd !== undefined && !reorder ? (
        <button
          ref={addButtonRef}
          type="button"
          className="wl-button--secondary wl-uf08__add"
          aria-haspopup="dialog"
          onClick={() => {
            pendingFocus.current = null;
            void navigate(`${location.pathname}${location.search}`, {
              state: { [SHEET_STATE]: true },
            });
          }}
        >
          <span>{en.uf08.addExercise}</span>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      ) : null}

      {reorder ? null : (
        <div className="wl-uf08__actions">
          {empty ? null : (
            <button
              type="button"
              className="wl-button--secondary"
              onClick={() => {
                pendingFocus.current = null;
                setStatus("");
                onShuffle();
              }}
            >
              {en.uf08.shuffle}
            </button>
          )}
          <button
            ref={looksGoodRef}
            type="button"
            className="wl-button--primary wl-uf08__primary"
            data-part="looks-good"
            // D-0236 §4, D-0239 §11: empty mode needs one item; it stays focusable and says why.
            aria-disabled={empty && items.length === 0 ? "true" : undefined}
            aria-describedby={empty && items.length === 0 ? needOneId : undefined}
            onClick={() => {
              if (empty && items.length === 0) return;
              void navigate(READY_HREF);
            }}
          >
            <span>{en.uf08.looksGood}</span>
            <ArrowIcon />
          </button>
          {empty && items.length === 0 ? (
            <p id={needOneId} className="wl-uf08__hint" data-part="need-one">
              {en.uf08.needOne}
            </p>
          ) : null}
        </div>
      )}
      {sheetOpen && onAdd !== undefined ? (
        <AddExerciseSheet
          catalog={catalog ?? []}
          items={items}
          budgetMin={workout.budgetMin}
          {...(empty
            ? { lead: en.uf08.addLeadEmpty(leftMinutes(workout), workout.budgetMin) }
            : {})}
          {...(blocked !== undefined ? { blocked } : {})}
          {...(favoriteIds !== undefined ? { favoriteIds } : {})}
          {...(favoritesLoaded !== undefined ? { favoritesLoaded } : {})}
          onAdd={(id) => {
            if (closing.current) return null;
            const refusal = onAdd(id);
            if (refusal === null) {
              closing.current = true;
              pendingAddFocus.current = id;
              if (empty) pendingAddStatus.current = exerciseName(id, library);
              else {
                keepActionStatus.current = true;
                setStatus(en.uf08.added(exerciseName(id, library)));
              }
              void navigate(-1);
            }
            return refusal;
          }}
          {...(onStartWith !== undefined
            ? {
                onStartWith: (id: string) => {
                  if (closing.current) return null;
                  const refusal = onStartWith(id);
                  if (refusal === null) {
                    closing.current = true;
                    keepActionStatus.current = true;
                    pendingAddFocus.current = id;
                    setStatus(en.uf08.mainNow(exerciseName(id, library)));
                    void navigate(-1);
                  }
                  return refusal;
                },
              }
            : {})}
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
