// UF-04.1 Library browse (T-0306a, D-0069 §1, D-0079 §1). Search and filters live in the URL
// (`q`, `area`, `mine=1`) and are updated with `replace`, so Back leaves the list.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { isEligible, type EngineProfile, type LibraryExercise } from "@workoutlab/engine";
import { AREAS, type Area } from "@workoutlab/shared";
import { TickIcon } from "../../components/icons/index.js";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import { useFavoriteIds } from "../../lib/offline/favorites-hooks.js";
import { useExcludedList } from "../../lib/offline/excluded-hooks.js";
import { loadLibrary, loadProfile } from "../../lib/offline/history.js";
import { loadRoutines, loadVariants } from "../../lib/offline/feature-loaders.js";
import { currentUserId } from "../../lib/offline/current-user.js";
import { useScreenData } from "./data.js";
import { areaName, equipmentText, primaryAreaNames, secondaryAreaNames } from "./labels.js";
import "./uf-04.css";

interface LibraryData {
  library: LibraryExercise[];
  profile: EngineProfile | null;
}

async function readLibrary(): Promise<LibraryData> {
  const [library, profile] = await Promise.all([loadLibrary(), loadProfile()]);
  return { library, profile };
}

function isAreaParam(value: string | null): value is Area {
  return value !== null && (AREAS as readonly string[]).includes(value);
}

// T-0639 (D-0217 §1): the two group chips. A group matches a weight-1 area inside it.
const GROUPS = {
  upper: ["chest", "back", "shoulders", "arms"],
  legs: ["glutes", "quads", "hamstrings", "calves"],
} as const satisfies Record<string, readonly Area[]>;
type Group = keyof typeof GROUPS;

function isGroupParam(value: string | null): value is Group {
  return value === "upper" || value === "legs";
}

interface PlanSets {
  /** Exercise ids that are an item of any cached routine. */
  inPlan: ReadonlySet<string>;
  /** Ids that are a variant of an exercise in a routine. */
  variants: ReadonlySet<string>;
}

// T-0640 (D-0217 §1): device cache only; one parallel read of the routines, then one of each
// routine exercise's variants. Tags render when it lands, never ahead of the list.
async function readPlanSets(): Promise<PlanSets> {
  const routines = await loadRoutines();
  const inPlan = new Set(routines.flatMap((r) => r.items.map((i) => i.exerciseId)));
  const lists = await Promise.all([...inPlan].map((id) => loadVariants(id)));
  return { inPlan, variants: new Set(lists.flat()) };
}

type Tag = "inPlan" | "variant" | "beginner";
const TAGS = {
  inPlan: { text: en.uf04.inPlan, sr: en.uf04.inPlanSr },
  variant: { text: en.uf04.variant, sr: en.uf04.variantSr },
  beginner: { text: en.uf04.beginner, sr: en.uf04.beginnerSr },
} as const;

export interface LibraryProps {
  /** IANA zone for the offline "last synced" time (D-0045 §9). Defaults to the device zone. */
  timeZone?: string;
}

function PlanTag({ tag }: { tag: Tag | null }) {
  if (tag === null) return null;
  return (
    <>
      <span className="wl-uf04__sr">{TAGS[tag].sr}</span>
      <span data-field={`tag-${tag}`} className="wl-uf04-browse__tag">
        {TAGS[tag].text}
      </span>
    </>
  );
}

export function Library(props: LibraryProps = {}) {
  // Resolved once per mount and always passed down, never left to OfflineStatus's own default.
  const [timeZone] = useState(
    () => props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [params, setParams] = useSearchParams();
  const { status } = useAuth();
  const { data, pending } = useScreenData(readLibrary, "library", { refresh: true, status });
  // The tag reads the device cache, so it shows offline too (D-0199 §10).
  const { ids: excludedIds } = useExcludedList(currentUserId());
  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);
  // T-0568: the "Favorite" tag; an id in both caches shows only "Not suggested".
  const favoriteIds = useFavoriteIds(currentUserId());
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  // Re-read whenever the library is (first read and the post-refresh read).
  const [plan, setPlan] = useState<PlanSets | null>(null);
  useEffect(() => {
    if (data === undefined) return;
    let live = true;
    readPlanSets().then(
      (sets) => {
        if (live) setPlan(sets);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [data]);

  function planTag(e: LibraryExercise): Tag | null {
    if (plan?.inPlan.has(e.id)) return "inPlan";
    if (plan?.variants.has(e.id)) return "variant";
    return e.level === "beginner" ? "beginner" : null;
  }

  const rawQuery = params.get("q") ?? "";
  const areaParam = params.get("area");
  const area = isAreaParam(areaParam) ? areaParam : null;
  // Both present: the area wins; an unknown group is ignored.
  const groupParam = params.get("group");
  const group = area === null && isGroupParam(groupParam) ? groupParam : null;
  const mineParam = params.get("mine") === "1";
  const [text, setText] = useState(rawQuery);

  const exercises = useMemo(
    () =>
      (data?.library ?? [])
        .filter((e) => e.kind === "exercise")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );
  const profile = data?.profile ?? null;
  const mine = mineParam && profile !== null;
  const query = rawQuery.trim().toLowerCase();
  // A first-ever visit holds the shell rather than claiming "never downloaded" from the
  // pre-refresh cache while the refresh that fills it is still in flight.
  const waitingForFirstDownload = exercises.length === 0 && pending;

  const rows = useMemo(
    () =>
      exercises.filter(
        (e) =>
          (query === "" || e.name.toLowerCase().includes(query)) &&
          (area === null || e.areas[area] === 1) &&
          (group === null || GROUPS[group].some((a) => e.areas[a] === 1)) &&
          (!mine || (profile !== null && isEligible(e, profile))),
      ),
    [exercises, query, area, group, mine, profile],
  );

  function update(change: (next: URLSearchParams) => void): void {
    const next = new URLSearchParams(params);
    change(next);
    setParams(next, { replace: true });
  }

  function onSearch(value: string): void {
    setText(value);
    update((next) => {
      if (value === "") next.delete("q");
      else next.set("q", value);
    });
  }

  function onArea(target: Area | null): void {
    update((next) => {
      if (target === null) next.delete("area");
      else next.set("area", target);
      next.delete("group");
    });
  }

  function onGroup(target: Group): void {
    update((next) => {
      next.set("group", target);
      next.delete("area");
    });
  }

  function onMine(): void {
    update((next) => {
      if (mine) next.delete("mine");
      else next.set("mine", "1");
    });
  }

  return (
    <div data-screen-id="UF-04.1" data-wl-state="plan" className="wl-page wl-uf04-browse">
      <h1 className="wl-type-page-title wl-title--stop">{en.screens.library}</h1>
      <OfflineStatus variant="text" timeZone={timeZone} />
      {data === undefined || waitingForFirstDownload ? null : exercises.length === 0 ? (
        <p className="wl-type-body">{en.uf04.neverDownloaded}</p>
      ) : (
        <>
          <div className="wl-uf04-browse__search">
            <input
              type="search"
              className="wl-input"
              aria-label={en.uf04.searchLabel}
              value={text}
              onChange={(event) => onSearch(event.target.value)}
            />
            {text === "" ? null : (
              <button type="button" className="wl-button--text" onClick={() => onSearch("")}>
                {en.uf04.clearSearch}
              </button>
            )}
          </div>
          <div role="group" aria-label={en.uf04.filtersLabel} className="wl-uf04-browse__chips">
            <button
              type="button"
              className="wl-chip"
              aria-pressed={area === null && group === null}
              onClick={() => onArea(null)}
            >
              <TickIcon size={16} className="wl-chip__tick" />
              {en.uf04.chipAll}
            </button>
            {(["upper", "legs"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className="wl-chip"
                aria-pressed={group === g}
                onClick={() => onGroup(g)}
              >
                <TickIcon size={16} className="wl-chip__tick" />
                {g === "upper" ? en.uf04.chipUpper : en.uf04.chipLegs}
              </button>
            ))}
            {AREAS.map((a) => (
              <button
                key={a}
                type="button"
                className="wl-chip"
                aria-pressed={area === a}
                onClick={() => onArea(a)}
              >
                <TickIcon size={16} className="wl-chip__tick" />
                {areaName(a)}
              </button>
            ))}
            {profile === null ? null : (
              <button type="button" className="wl-chip" aria-pressed={mine} onClick={onMine}>
                <TickIcon size={16} className="wl-chip__tick" />
                {en.uf04.chipMine}
              </button>
            )}
          </div>
          {rows.length === 0 ? null : (
            <p role="status" data-part="count" className="wl-type-label wl-uf04-browse__count">
              {en.uf04.resultCount(rows.length)}
            </p>
          )}
          {rows.length === 0 ? (
            <p className="wl-type-body">
              {query === "" ? en.uf04.noMatchFilters : en.uf04.noMatchQuery(rawQuery.trim())}
            </p>
          ) : (
            <ul className="wl-uf04-browse__list">
              {rows.map((e) => {
                const secondary = secondaryAreaNames(e);
                return (
                  <li key={e.id}>
                    <Link to={`/library/${e.id}`} className="wl-row wl-uf04-browse__row">
                      <span data-field="name" className="wl-type-row-title">
                        {e.name}
                      </span>
                      {excluded.has(e.id) ? (
                        <>
                          <span className="wl-uf04__sr">{en.uf04.notSuggestedSr}</span>
                          <span data-field="not-suggested" className="wl-uf04-browse__tag">
                            {en.uf04.notSuggested}
                          </span>
                        </>
                      ) : favorites.has(e.id) ? (
                        <>
                          <span className="wl-uf04__sr">{en.uf04.favoriteSr}</span>
                          <span data-field="favorite" className="wl-uf04-browse__tag">
                            {en.uf04.favorite}
                          </span>
                        </>
                      ) : (
                        <PlanTag tag={planTag(e)} />
                      )}
                      <span className="wl-uf04-browse__caption">
                        <span data-field="primary" className="wl-type-label">
                          {primaryAreaNames(e).join(en.uf04.listSeparator)}
                        </span>
                        {secondary.length === 0 ? null : (
                          <span data-field="secondary" className="wl-type-label">
                            {secondary.join(en.uf04.listSeparator)}
                          </span>
                        )}
                        <span data-field="equipment" className="wl-type-label">
                          {equipmentText(e)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
