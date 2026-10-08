// T-0569 UF-11.6: manage the favorite-exercises list (D-0202 §8-§10), the mirror of UF-11.5.
// Cache-first; a refresh runs on mount when online. Writes are online-only and the list changes
// only after the server confirms (the write helpers update the cache).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isEligible, primaryAreas } from "@workoutlab/engine";
import { AREAS, type Area, type EngineProfile, type LibraryExercise } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import { currentUserId, loadLibrary, loadProfile } from "../../lib/offline/index.js";
import { useExcludedIds, useOnline } from "../../lib/offline/excluded-hooks.js";
import {
  favoriteExercise,
  refreshFavorites,
  unfavoriteExercise,
} from "../../lib/offline/favorites.js";
import { useFavoriteList } from "../../lib/offline/favorites-hooks.js";
import "./excluded.css";

const s = en.uf11.favoritesScreen;

interface Item {
  /** Unique per rendered row: `id` in search results, `area/id` in a group. */
  key: string;
  id: string;
  name: string;
  area: Area | null;
  areas: string;
  line: string | null;
}

const byNameThenId = (a: { id: string; name: string }, b: { id: string; name: string }) =>
  a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function FavoritesBody() {
  const userId = currentUserId();
  const online = useOnline();
  const { ids: favoriteIds, loaded: favLoaded } = useFavoriteList(userId);
  const excludedIds = useExcludedIds(userId);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [profile, setProfile] = useState<EngineProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");
  const offlineId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfter = useRef<{ key: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadLibrary().catch(() => [] as LibraryExercise[]),
      loadProfile().catch(() => null),
    ]).then(([lib, prof]) => {
      if (cancelled) return;
      setLibrary(lib);
      setProfile(prof);
      setLoaded(true);
    });
    if (navigator.onLine) void refreshFavorites();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);

  const needle = query.trim().toLowerCase();

  const statusLine = (e: LibraryExercise): string | null => {
    if (!profile) return null;
    if (!isEligible(e, { ...profile, level: "advanced" }, [])) return s.notAvailable;
    if (!isEligible(e, profile, [])) return s.aboveLevel;
    return null;
  };

  const groups = useMemo(() => {
    if (needle !== "") return [];
    const out: Array<{ area: Area; items: Item[] }> = [];
    for (const area of AREAS) {
      const items: Item[] = [];
      for (const id of favoriteIds) {
        const e = byId.get(id);
        if (!e || e.areas[area] !== 1) continue;
        items.push({
          key: `${area}/${id}`,
          id,
          name: e.name,
          area,
          areas: "",
          line: statusLine(e),
        });
      }
      if (items.length > 0) out.push({ area, items: items.sort(byNameThenId) });
    }
    return out;
  }, [needle, favoriteIds, byId, profile]);

  const results: Item[] = useMemo(() => {
    if (needle === "") return [];
    return library
      .filter((e) => e.kind === "exercise" && e.name.toLowerCase().includes(needle))
      .map((e) => ({
        key: e.id,
        id: e.id,
        name: e.name,
        area: null,
        areas: primaryAreas(e)
          .map((a) => en.bodyMap.areas[a])
          .join(", "),
        line: null,
      }))
      .sort(byNameThenId);
  }, [needle, library]);

  const visible = useMemo(
    () => (needle === "" ? groups.flatMap((g) => g.items) : results),
    [needle, groups, results],
  );

  // Move focus once the list has re-rendered without the removed row.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const el = target.key ? buttons.current.get(target.key) : undefined;
    (el ?? searchRef.current)?.focus();
  }, [visible]);

  async function toggle(item: Item) {
    if (!userId || !online || pending.has(item.id)) return;
    const isFavorite = favorites.has(item.id);
    const wasExcluded = !isFavorite && excluded.has(item.id);
    setFailed(false);
    setPending((p) => new Set(p).add(item.id));
    // The rows that leave with this one in a group list (an exercise under two areas leaves both).
    const idx = visible.findIndex((i) => i.key === item.key);
    const next = visible.slice(idx + 1).find((i) => i.id !== item.id) ?? null;
    const prev = [...visible.slice(0, idx)].reverse().find((i) => i.id !== item.id) ?? null;
    try {
      if (isFavorite) await unfavoriteExercise(userId, item.id);
      else await favoriteExercise(userId, item.id);
      setStatus(
        isFavorite
          ? s.announceRemoved(item.name)
          : wasExcluded
            ? s.announceMoved(item.name)
            : s.announceAdded(item.name),
      );
      if (isFavorite && needle === "") focusAfter.current = { key: (next ?? prev)?.key ?? null };
    } catch {
      setFailed(true);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(item.id);
        return n;
      });
    }
  }

  const lineIdOf = (item: Item) => `${offlineId}-${item.key.replace(/\W/g, "-")}`;

  function renderButton(item: Item) {
    const isFavorite = favorites.has(item.id);
    const isPending = pending.has(item.id);
    const disabled = !online || isPending;
    const label = isFavorite
      ? item.area
        ? s.removeNameIn(item.name, en.bodyMap.areas[item.area])
        : s.removeName(item.name)
      : s.addName(item.name);
    return (
      <button
        type="button"
        ref={(el) => {
          if (el) buttons.current.set(item.key, el);
          else buttons.current.delete(item.key);
        }}
        className="wl-button--secondary wl-excluded__button"
        aria-label={label}
        aria-disabled={disabled ? "true" : undefined}
        aria-describedby={
          [item.line ? lineIdOf(item) : null, online ? null : offlineId]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onClick={() => {
          if (disabled) return;
          void toggle(item);
        }}
      >
        {isPending ? s.saving : isFavorite ? s.remove : s.add}
      </button>
    );
  }

  function renderRow(item: Item) {
    const isFavorite = favorites.has(item.id);
    const isExcluded = excluded.has(item.id);
    const lineId = lineIdOf(item);
    return (
      <li key={item.key} className="wl-card wl-excluded__row" data-exercise-id={item.id}>
        <span className="wl-excluded__text">
          <span className="wl-plan__name">{item.name}</span>
          {item.areas ? <span className="wl-caption">{item.areas}</span> : null}
          {item.line ? (
            <span id={lineId} className="wl-caption">
              {item.line}
            </span>
          ) : null}
          {needle !== "" && (isFavorite || isExcluded) ? (
            <span className="wl-caption wl-favorites__tag">
              {isFavorite ? s.favoriteTag : s.excludedTag}
            </span>
          ) : null}
        </span>
        {renderButton(item)}
      </li>
    );
  }

  const loading = !loaded || !favLoaded;

  return (
    <div className="wl-excluded wl-favorites">
      <p className="wl-muted">{s.lead}</p>
      {online ? null : (
        <p id={offlineId} className="wl-caption">
          {s.connectToChange}
        </p>
      )}
      <div className="wl-excluded__search">
        <label className="wl-label" htmlFor={`${offlineId}-q`}>
          {s.searchLabel}
        </label>
        <div className="wl-excluded__field">
          <input
            id={`${offlineId}-q`}
            ref={searchRef}
            type="search"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query === "" ? null : (
            <button
              type="button"
              className="wl-excluded__clear"
              aria-label={s.clearSearch}
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <svg aria-hidden focusable={false} width={18} height={18} viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {failed ? (
        <p role="alert" className="wl-excluded__fail">
          <svg aria-hidden focusable={false} width={20} height={20} viewBox="0 0 24 24">
            <circle cx={12} cy={12} r={9} />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>{en.excluded.saveFailed}</span>
        </p>
      ) : null}
      <p role="status" className="wl-excluded__status">
        {status}
      </p>
      {loading && favoriteIds.length === 0 ? (
        <ul className="wl-excluded__list" aria-label={s.loading} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="wl-excluded__skeleton" />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <p className="wl-muted wl-excluded__empty">
          {needle === "" ? s.emptyNone : s.emptyQuery(query.trim())}
        </p>
      ) : needle === "" ? (
        <div className="wl-excluded__list">
          {groups.map((g) => {
            const hid = `${offlineId}-g-${g.area}`;
            return (
              <section key={g.area} className="wl-card" aria-labelledby={hid}>
                <h2 id={hid} className="wl-label">
                  {en.bodyMap.areas[g.area]}
                </h2>
                <ul className="wl-excluded__list" aria-label={en.bodyMap.areas[g.area]}>
                  {g.items.map((item) => renderRow(item))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="wl-excluded__list" aria-label={s.list}>
          {results.map((item) => renderRow(item))}
        </ul>
      )}
    </div>
  );
}
