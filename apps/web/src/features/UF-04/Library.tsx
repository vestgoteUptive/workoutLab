// UF-04.1 Library browse (T-0306a, D-0069 §1, D-0079 §1). Search and filters live in the URL
// (`q`, `area`, `mine=1`) and are updated with `replace`, so Back leaves the list.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { isEligible, type EngineProfile, type LibraryExercise } from "@workoutlab/engine";
import { AREAS, type Area } from "@workoutlab/shared";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { en } from "../../lib/i18n/en.js";
import { loadLibrary, loadProfile } from "../../lib/offline/history.js";
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

export function Library() {
  const [params, setParams] = useSearchParams();
  const { data, pending } = useScreenData(readLibrary, "library", { refresh: true });

  const rawQuery = params.get("q") ?? "";
  const areaParam = params.get("area");
  const area = isAreaParam(areaParam) ? areaParam : null;
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
          (!mine || (profile !== null && isEligible(e, profile))),
      ),
    [exercises, query, area, mine, profile],
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
    });
  }

  function onMine(): void {
    update((next) => {
      if (mine) next.delete("mine");
      else next.set("mine", "1");
    });
  }

  return (
    <div data-screen-id="UF-04.1" className="wl-uf04">
      <h1>{en.screens.library}</h1>
      <OfflineStatus variant="text" />
      {data === undefined || waitingForFirstDownload ? null : exercises.length === 0 ? (
        <p>{en.uf04.neverDownloaded}</p>
      ) : (
        <>
          <input
            type="search"
            className="wl-uf04__search"
            aria-label={en.uf04.searchLabel}
            value={text}
            onChange={(event) => onSearch(event.target.value)}
          />
          <div role="group" aria-label={en.uf04.filtersLabel} className="wl-uf04__chips">
            <button
              type="button"
              className="wl-uf04__chip"
              aria-pressed={area === null}
              onClick={() => onArea(null)}
            >
              {en.uf04.chipAll}
            </button>
            {AREAS.map((a) => (
              <button
                key={a}
                type="button"
                className="wl-uf04__chip"
                aria-pressed={area === a}
                onClick={() => onArea(a)}
              >
                {areaName(a)}
              </button>
            ))}
            {profile === null ? null : (
              <button type="button" className="wl-uf04__chip" aria-pressed={mine} onClick={onMine}>
                {en.uf04.chipMine}
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p>{query === "" ? en.uf04.noMatchFilters : en.uf04.noMatchQuery(rawQuery.trim())}</p>
          ) : (
            <ul className="wl-uf04__list">
              {rows.map((e) => {
                const secondary = secondaryAreaNames(e);
                return (
                  <li key={e.id}>
                    <Link to={`/library/${e.id}`} className="wl-uf04__row">
                      <span data-field="name" className="wl-uf04__row-name">
                        {e.name}
                      </span>
                      <span data-field="primary" className="wl-uf04__row-areas">
                        {primaryAreaNames(e).join(en.uf04.listSeparator)}
                      </span>
                      {secondary.length === 0 ? null : (
                        <span data-field="secondary" className="wl-uf04__row-muted">
                          {secondary.join(en.uf04.listSeparator)}
                        </span>
                      )}
                      <span data-field="equipment" className="wl-uf04__row-muted">
                        {equipmentText(e)}
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
