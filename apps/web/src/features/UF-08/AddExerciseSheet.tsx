// UF-08.5 Add exercise (T-0573, D-0205 §1-§4, Design-docs/.../UF-08.5.md). A sheet over UF-08.2:
// search over the cached library (kind `exercise`), or "Today's areas" with an empty query.
// Principle 3: the sheet picks nothing. Add hands the id to the host, which asks the engine
// (`suggest` with `pinnedIds`); the engine silently drops a pin that does not fit, so the host's
// answer is a refusal text (shown here, the sheet stays open) or null (the host closes it).
// Search and Add run on the device from the cache: no request, online or off.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AREAS,
  primaryAreas,
  type Area,
  type LibraryExercise,
  type WorkoutItem,
} from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";

export interface AddExerciseSheetProps {
  catalog: readonly LibraryExercise[];
  items: readonly WorkoutItem[];
  budgetMin: number;
  /** Exercise id to its disabled-row reason line (T-0574); absent ids can be added. */
  blocked?: Readonly<Record<string, string>>;
  /** T-0577: stored favorite ids and whether that list has loaded (D-0205 §2, D-0202). */
  favoriteIds?: readonly string[];
  favoritesLoaded?: boolean;
  /** Returns null when the exercise was added (the host closes the sheet), else the refusal. */
  onAdd: (exerciseId: string) => string | null;
  /** T-0575: "Start with this" (compounds only). Same contract as `onAdd`. */
  onStartWith?: (exerciseId: string) => string | null;
  onClose: () => void;
}

function areaLabel(area: Area): string {
  return en.bodyMap.areas[area];
}

function byNameThenId(a: LibraryExercise, b: LibraryExercise): number {
  return a.name.localeCompare(b.name, "en") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function AddExerciseSheet({
  catalog,
  items,
  budgetMin,
  blocked = {},
  favoriteIds = [],
  favoritesLoaded = true,
  onAdd,
  onStartWith,
  onClose,
}: AddExerciseSheetProps) {
  const titleId = useId();
  const searchId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const exercises = useMemo(
    () => catalog.filter((e) => e.kind === "exercise").sort(byNameThenId),
    [catalog],
  );
  const inPlan = useMemo(() => new Set(items.map((i) => i.exerciseId)), [items]);
  // The engine's `isMain`, never the position (T-0575).
  const mainId = useMemo(() => items.find((i) => i.isMain)?.exerciseId ?? null, [items]);
  const q = query.trim();

  const results = useMemo(
    () => (q === "" ? [] : exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))),
    [exercises, q],
  );

  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const favorites = useMemo(() => exercises.filter((e) => favSet.has(e.id)), [exercises, favSet]);

  // Areas of the current items, fixed order; exercises with weight 1.0 there, minus favorites.
  const groups = useMemo(() => {
    const todays = new Set<Area>();
    for (const item of items) {
      const lib = catalog.find((e) => e.id === item.exerciseId);
      if (lib !== undefined) for (const a of primaryAreas(lib)) todays.add(a);
    }
    return AREAS.filter((a) => todays.has(a)).map((area) => ({
      area,
      rows: exercises.filter((e) => e.areas[area] === 1 && !favSet.has(e.id)),
    }));
  }, [catalog, exercises, items, favSet]);

  const appearances = useMemo(() => {
    const count = new Map<string, number>();
    for (const g of groups) for (const e of g.rows) count.set(e.id, (count.get(e.id) ?? 0) + 1);
    return count;
  }, [groups]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        const panel = panelRef.current;
        if (panel === null) return;
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button, input"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first === undefined || last === undefined) {
          event.preventDefault();
          panel.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panel)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function add(e: LibraryExercise): void {
    setStatus("");
    const refusal = onAdd(e.id);
    if (refusal !== null) setStatus(refusal);
  }

  function startWith(e: LibraryExercise): void {
    setStatus("");
    const refusal = onStartWith?.(e.id) ?? null;
    if (refusal !== null) setStatus(refusal);
  }

  function row(e: LibraryExercise, areaSuffix?: string, idKey = areaSuffix) {
    const here = inPlan.has(e.id);
    const reason = here ? undefined : blocked[e.id];
    const reasonId = `${titleId}-why-${e.id}${idKey ? `-${idKey}` : ""}`;
    const canStart = onStartWith !== undefined && e.type === "compound" && e.id !== mainId;
    const startButton = canStart ? (
      <button
        type="button"
        className="wl-uf08__ghost wl-uf08__pick-add"
        data-part="pick-start"
        aria-label={en.uf08.startWithName(e.name)}
        aria-disabled={!here && reason !== undefined ? "true" : undefined}
        aria-describedby={!here && reason !== undefined ? reasonId : undefined}
        onClick={() => {
          if (here || reason === undefined) startWith(e);
        }}
      >
        {en.uf08.startWith}
      </button>
    ) : null;
    return (
      <li key={e.id} className="wl-uf08__pick" data-part="pick-row" data-id={e.id}>
        <span className="wl-uf08__pick-name">
          {e.name}
          {favSet.has(e.id) ? (
            <span className="wl-uf08__fav-tag" data-part="favorite-tag">
              {en.uf08.favoriteTag}
            </span>
          ) : null}
        </span>
        <span className="wl-uf08__row-detail" data-part="pick-areas">
          {primaryAreas(e).map(areaLabel).join(", ")}
        </span>
        {here ? (
          <span className="wl-uf08__row-detail" data-part="pick-reason">
            {en.uf08.inWorkout}
          </span>
        ) : null}
        {here ? (
          startButton
        ) : (
          <>
            {reason !== undefined ? (
              <span id={reasonId} className="wl-uf08__row-detail" data-part="pick-reason">
                {reason}
              </span>
            ) : null}
            <button
              type="button"
              className="wl-uf08__ghost wl-uf08__pick-add"
              data-part="pick-add"
              aria-label={en.uf08.addName(e.name, areaSuffix)}
              aria-disabled={reason !== undefined ? "true" : undefined}
              aria-describedby={reason !== undefined ? reasonId : undefined}
              onClick={() => {
                if (reason === undefined) add(e);
              }}
            >
              {en.uf08.add}
            </button>
            {startButton}
          </>
        )}
      </li>
    );
  }

  return (
    <div className="wl-uf08__scrim">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="wl-uf08__sheet"
        data-screen-id="UF-08.5"
      >
        <div className="wl-uf08__sheet-head">
          <h2 id={titleId} className="wl-uf08__sheet-title">
            {en.uf08.addExercise}
          </h2>
          <button
            type="button"
            className="wl-uf08__icon"
            aria-label={en.uf08.close}
            onClick={() => onClose()}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          </button>
        </div>
        <p className="wl-uf08__sheet-lead">{en.uf08.addLead(budgetMin)}</p>
        <label htmlFor={searchId} className="wl-uf08__label">
          {en.uf08.searchLabel}
        </label>
        <div className="wl-uf08__search">
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            className="wl-uf08__search-input"
            value={query}
            autoComplete="off"
            onChange={(ev) => {
              setQuery(ev.target.value);
              setStatus("");
            }}
          />
          {query !== "" ? (
            <button
              type="button"
              className="wl-uf08__icon"
              aria-label={en.uf08.clearSearch}
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </button>
          ) : null}
        </div>
        <div role="status" className="wl-uf08__sheet-status" data-part="sheet-status">
          {status}
        </div>

        <div className="wl-uf08__sheet-body">
          {q !== "" ? (
            results.length === 0 ? (
              <p className="wl-uf08__sheet-empty">{en.uf08.noMatch(q)}</p>
            ) : (
              <ul className="wl-uf08__picks">{results.map((e) => row(e))}</ul>
            )
          ) : !favoritesLoaded ? null : favorites.length === 0 && groups.length === 0 ? (
            <p className="wl-uf08__sheet-empty">{en.uf08.searchToFind}</p>
          ) : (
            <>
              {favorites.length > 0 ? (
                <section aria-labelledby={`${titleId}-favorites`}>
                  <h2 id={`${titleId}-favorites`} className="wl-uf08__label wl-uf08__sheet-sub">
                    {en.uf08.favoritesHeading}
                  </h2>
                  <ul className="wl-uf08__picks">
                    {favorites.map((e) => row(e, undefined, "favorites"))}
                  </ul>
                </section>
              ) : null}
              {groups.length > 0 ? (
                <>
                  <h2 className="wl-uf08__label wl-uf08__sheet-sub">{en.uf08.todaysAreas}</h2>
                  {groups.map((g) => (
                    <section key={g.area} aria-labelledby={`${titleId}-${g.area}`}>
                      <h2 id={`${titleId}-${g.area}`} className="wl-uf08__label">
                        {areaLabel(g.area)}
                      </h2>
                      <ul className="wl-uf08__picks">
                        {g.rows.map((e) =>
                          row(e, (appearances.get(e.id) ?? 0) > 1 ? areaLabel(g.area) : undefined),
                        )}
                      </ul>
                    </section>
                  ))}
                </>
              ) : (
                <p className="wl-uf08__sheet-empty">{en.uf08.searchToFind}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
