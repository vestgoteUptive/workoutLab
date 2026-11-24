// UF-08.6 Area detail (T-0997, D-0274 §5, D-0275 §8, D-0276, UF-08.6.md). One area of today's plan:
// its exercises with Swap, Not today, Remove, Start with this, How to, and a local Add exercise.
// Principle 3: this file picks nothing. Each tap goes to the host, which asks the engine
// (`applySwap`, `rankSwaps`, `removeItem`, `insertItem`, `orderItems`) and hands back the plan or a
// refusal. The rows are the area's items of the host's plan, in its (already ordered) sequence.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  areaGroups,
  primaryAreas,
  type Area,
  type LibraryExercise,
  type Workout,
  type WorkoutItem,
} from "@workoutlab/engine";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { formatKg, formatSetCount } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { itemReasonLine, itemSummary } from "../../lib/i18n/workout.js";
import { ExerciseHowTo } from "../UF-04/index.js";
import type { AreaLoad } from "./AreaPlan.js";
import { AddExerciseSheet } from "./AddExerciseSheet.js";
import { RemovedLine } from "./RemovedLine.js";
import { exerciseName, isBodyweight } from "./rows.js";

/** UF-08.5 is open while the current history entry carries this state; the URL never changes. */
const SHEET_STATE = "wlAddSheet";
const PLAN_HREF = "/session/setup?step=suggested";

export interface NotTodayLine {
  oldId: string;
  newId: string;
}

/** What the host's local Add came to. */
export type AddOutcome =
  { refused: string } | { added: true; homeArea: Area | null; areaWasNew: boolean; left: number };

export interface AreaDetailProps {
  area: Area;
  /** The host's plan, already in `orderItems` order. */
  workout: Workout;
  catalog: readonly LibraryExercise[];
  locale: string;
  timeZone: string;
  load: AreaLoad;
  favoriteIds: readonly string[];
  favoritesLoaded: boolean;
  /** Ids added on this visit through UF-08.5 ("Added by you"). */
  addedIds: readonly string[];
  notToday: readonly NotTodayLine[];
  /** Ids removed on this visit from this area, in tap order (the Removed line). */
  removedIds: readonly string[];
  storedIds: readonly string[];
  online: boolean;
  exclusionFailed?: boolean;
  onExclude?: ((id: string) => Promise<void>) | undefined;
  onInclude?: ((id: string) => Promise<void>) | undefined;
  blocked: Readonly<Record<string, string>>;
  /** The exercise whose Swap button takes focus on mount (back from UF-08.3). */
  focusSwap?: string | null;
  onFocused?: () => void;
  onSwap: (id: string) => void;
  /** The new exercise's id, or null when no other exercise fits (the plan is unchanged). */
  onNotToday: (id: string) => string | null;
  onUndoNotToday: (line: NotTodayLine) => void;
  /** "last": the area is empty now and the host leaves; "failed": nothing changed. */
  onRemove: (id: string) => "ok" | "last" | "failed";
  onStartWith: (id: string) => string | null;
  onAdd: (id: string) => AddOutcome;
}

type Pending =
  { kind: "part"; id: string; part: "swap" | "not-today" } | { kind: "removed"; index: number };

function minutesOf(seconds: number): number {
  return Math.ceil(seconds / 60);
}

function itemDetail(
  item: WorkoutItem,
  library: readonly LibraryExercise[],
  locale: string,
): string {
  const parts = [itemSummary(item)];
  if (isBodyweight(item.exerciseId, library)) parts.push(en.uf08.bodyweight);
  else if (item.prefill.weightKg !== null) parts.push(formatKg(item.prefill.weightKg, locale));
  parts.push(en.uf08.rowMinutes(minutesOf(item.costS)));
  return en.uf08.rowDetail(parts);
}

export function AreaDetail({
  area,
  workout,
  catalog,
  locale,
  timeZone,
  load,
  favoriteIds,
  favoritesLoaded,
  addedIds,
  notToday,
  removedIds,
  storedIds,
  online,
  exclusionFailed = false,
  onExclude,
  onInclude,
  blocked,
  focusSwap = null,
  onFocused,
  onSwap,
  onNotToday,
  onUndoNotToday,
  onRemove,
  onStartWith,
  onAdd,
}: AreaDetailProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const sheetOpen = (location.state as Record<string, unknown> | null)?.[SHEET_STATE] === true;
  const [status, setStatus] = useState("");
  const [howToId, setHowToId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<Pending | null>(null);
  const pendingAddFocus = useRef<string | null>(null);
  const sheetWasOpen = useRef(false);
  const closing = useRef(false);
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const titleId = useId();

  const group = useMemo(() => areaGroups(workout).find((g) => g.area === area), [workout, area]);
  const items = useMemo(
    () =>
      (group?.itemIds ?? []).flatMap((id) => {
        const item = workout.plan.items.find((i) => i.exerciseId === id);
        return item === undefined ? [] : [item];
      }),
    [group, workout],
  );
  const name = en.bodyMap.areas[area];

  const focusPart = (id: string, part: string): boolean => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(id)}"] [data-part="${part}"]`,
    );
    el?.focus();
    return el !== null && el !== undefined;
  };

  // Back from UF-08.3: focus goes to the Swap button of the row (mount only).
  useEffect(() => {
    if (focusSwap === null) return;
    if (!focusPart(focusSwap, "swap")) addRef.current?.focus();
    onFocused?.();
  }, []);

  // Where focus goes once the host's new plan has rendered. Never `body`.
  useEffect(() => {
    const p = pending.current;
    if (p === null) return;
    pending.current = null;
    if (p.kind === "part") {
      if (!focusPart(p.id, p.part) && !focusPart(p.id, "swap")) addRef.current?.focus();
    } else {
      const swaps = listRef.current?.querySelectorAll<HTMLElement>('[data-part="swap"]');
      const target = swaps && swaps.length > 0 ? swaps[Math.min(p.index, swaps.length - 1)] : null;
      (target ?? addRef.current)?.focus();
    }
  }, [workout]);

  // Closing the sheet: focus goes to the new row's Swap button after an Add, else "Add exercise".
  useEffect(() => {
    if (sheetWasOpen.current === sheetOpen) return;
    sheetWasOpen.current = sheetOpen;
    closing.current = false;
    if (sheetOpen) return;
    const id = pendingAddFocus.current;
    pendingAddFocus.current = null;
    if (id === null || !focusPart(id, "swap")) addRef.current?.focus();
  }, [sheetOpen]);

  // This area's lines: the new exercise still in the plan, and either here or replacing one homed here.
  const lines = notToday.filter((l) => {
    if (!workout.plan.items.some((i) => i.exerciseId === l.newId)) return false;
    const old = catalog.find((e) => e.id === l.oldId);
    return (
      items.some((i) => i.exerciseId === l.newId) ||
      (old !== undefined && primaryAreas(old)[0] === area)
    );
  });

  const minutes = minutesOf(group?.costS ?? 0);

  return (
    <section
      data-screen-id="UF-08.6"
      data-wl-state="plan"
      className="wl-uf08 wl-uf08__detail wl-page"
      data-area={area}
    >
      <div className="wl-uf08__top">
        <Link
          className="wl-uf08__back"
          to={PLAN_HREF}
          data-part="back"
          onClick={(e) => {
            // The link and the browser Back button do the same thing (UF-08.6.md › Focus).
            e.preventDefault();
            void navigate(-1);
          }}
        >
          {en.uf08.back}
        </Link>
        <OfflineStatus variant="icon" locale={locale} timeZone={timeZone} />
      </div>

      <div className="wl-uf08__heading">
        <h1 id={titleId} className="wl-uf08__title" data-part="detail-title">
          {name}
        </h1>
        <p className="wl-uf08__label" data-part="detail-sets">
          {en.uf08.detailSets(group?.sets ?? 0, minutes)}
        </p>
        <p className="wl-uf08__label" data-part="detail-history">
          {en.uf08.historyLine(
            formatSetCount(load.load, locale),
            formatSetCount(load.target, locale),
          )}
        </p>
      </div>

      <ul className="wl-uf08__detail-rows" ref={listRef} aria-label={en.uf08.detailRowsName(name)}>
        {items.map((item, index) => {
          const exName = exerciseName(item.exerciseId, catalog);
          const lib = catalog.find((e) => e.id === item.exerciseId);
          const reason = addedIds.includes(item.exerciseId)
            ? en.uf08.addedByYou
            : itemReasonLine(item.reasons);
          const fav = favSet.has(item.exerciseId);
          return (
            <li
              key={item.exerciseId}
              className="wl-row wl-uf08__detail-row"
              data-part="detail-row"
              data-id={item.exerciseId}
              data-main={item.isMain ? "true" : undefined}
            >
              <span className="wl-uf08__detail-name wl-type-row-title" data-part="row-name">
                <span>{exName}</span>
                {fav ? (
                  <span className="wl-chip wl-uf08__tag" data-part="row-favorite">
                    {en.uf08.favoriteTag}
                  </span>
                ) : null}
                {item.isMain ? (
                  <span className="wl-chip wl-uf08__tag" data-part="row-main">
                    {en.uf08.mainTag}
                  </span>
                ) : null}
              </span>
              <span className="wl-uf08__row-detail wl-type-label" data-part="row-detail">
                {itemDetail(item, catalog, locale)}
              </span>
              {reason !== "" ? (
                <span className="wl-uf08__row-detail wl-type-label" data-part="row-reason">
                  {reason}
                </span>
              ) : null}
              <button
                type="button"
                className="wl-uf08__detail-how"
                data-part="how-to"
                aria-label={en.uf08.howTo(exName)}
                onClick={() => setHowToId(item.exerciseId)}
              >
                {en.uf08.howToText}
              </button>
              <div className="wl-uf08__detail-actions">
                <button
                  type="button"
                  className="wl-button--secondary"
                  data-part="swap"
                  aria-label={en.uf08.swapItem(exName)}
                  onClick={() => {
                    setStatus("");
                    onSwap(item.exerciseId);
                  }}
                >
                  {en.uf08.swap}
                </button>
                <button
                  type="button"
                  className="wl-button--secondary"
                  data-part="not-today"
                  aria-label={en.uf08.notTodayName(exName)}
                  onClick={() => {
                    const next = onNotToday(item.exerciseId);
                    if (next === null) {
                      setStatus(en.uf08.notTodayNone(name));
                      return;
                    }
                    setStatus(en.uf08.replacedBy(exName, exerciseName(next, catalog)));
                    pending.current = { kind: "part", id: next, part: "not-today" };
                  }}
                >
                  {en.uf08.notToday}
                </button>
                <button
                  type="button"
                  className="wl-button--secondary"
                  data-part="remove"
                  aria-label={en.uf08.remove(exName)}
                  onClick={() => {
                    const result = onRemove(item.exerciseId);
                    if (result === "failed") return;
                    setStatus(en.uf08.removedStatus(exName));
                    pending.current = { kind: "removed", index };
                  }}
                >
                  {en.uf08.removeText}
                </button>
                {!item.isMain && lib?.type === "compound" ? (
                  <button
                    type="button"
                    className="wl-button--secondary"
                    data-part="start-with"
                    aria-label={en.uf08.startWithName(exName)}
                    onClick={() => {
                      const refusal = onStartWith(item.exerciseId);
                      if (refusal === null) {
                        setStatus(en.uf08.mainNow(exName));
                        pending.current = { kind: "part", id: item.exerciseId, part: "swap" };
                      } else setStatus(refusal);
                    }}
                  >
                    {en.uf08.startWith}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {lines.length > 0 ? (
        <ul
          className="wl-uf08__removed-rows"
          data-part="not-today-line"
          aria-label={en.uf08.notToday}
        >
          {lines.map((line) => {
            const old = exerciseName(line.oldId, catalog);
            return (
              <li
                key={line.newId}
                className="wl-row wl-uf08__removed-row wl-uf08__nottoday-row"
                data-part="not-today-row"
              >
                <span>{en.uf08.notTodayLine(old)}</span>
                <button
                  type="button"
                  className="wl-button--text wl-uf08__removed-btn"
                  data-part="not-today-undo"
                  aria-label={en.uf08.notTodayUndoName(old)}
                  onClick={() => {
                    onUndoNotToday(line);
                    setStatus(en.uf08.notTodayBack(old));
                    pending.current = { kind: "part", id: line.oldId, part: "not-today" };
                  }}
                >
                  {en.uf08.undo}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <RemovedLine
        ids={removedIds}
        library={catalog}
        storedIds={storedIds}
        online={online}
        onExclude={onExclude}
        onInclude={onInclude}
      />

      <div role="status" className="wl-uf08__status" data-part="status">
        {status}
      </div>
      <div aria-live="assertive" data-part="exclusion-failed">
        {exclusionFailed ? (
          <p role="alert" className="wl-uf08__status">
            {en.excluded.saveFailed}
          </p>
        ) : null}
      </div>

      <button
        ref={addRef}
        type="button"
        className="wl-button--secondary wl-uf08__add"
        data-part="add-exercise"
        aria-haspopup="dialog"
        onClick={() => {
          pending.current = null;
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

      {sheetOpen ? (
        <AddExerciseSheet
          catalog={catalog}
          items={workout.plan.items}
          budgetMin={workout.budgetMin}
          firstArea={area}
          blocked={blocked}
          favoriteIds={favoriteIds}
          favoritesLoaded={favoritesLoaded}
          onAdd={(id) => {
            if (closing.current) return null;
            const out = onAdd(id);
            if ("refused" in out) return out.refused;
            closing.current = true;
            pendingAddFocus.current = id;
            const added = exerciseName(id, catalog);
            setStatus(
              out.areaWasNew && out.homeArea !== null
                ? en.uf08.addedAreaIn(added, en.bodyMap.areas[out.homeArea])
                : en.uf08.addedLeft(added, out.left),
            );
            void navigate(-1);
            return null;
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
