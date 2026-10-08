// T-0540 UF-11.5: manage the excluded-exercises list (D-0199 §7-§10). Cache-first: the list reads
// the T-0536 device cache; a refresh runs on mount when online. Writes are online-only and the
// list changes only after the server confirms (the cache is written by the write helpers).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { excludedOutAreas, primaryAreas } from "@workoutlab/engine";
import type { EngineProfile, LibraryExercise } from "@workoutlab/shared";
import { ExcludedAreasNotice } from "../../components/excluded-areas-notice/index.js";
import { en } from "../../lib/i18n/en.js";
import { currentUserId, loadLibrary, loadProfile } from "../../lib/offline/index.js";
import {
  excludeExercise,
  includeExercise,
  loadExcludedIds,
  refreshExcluded,
} from "../../lib/offline/excluded.js";
import { useExcludedRows, useOnline } from "../../lib/offline/excluded-hooks.js";
import { formatInstantDay, resolveTimeZone } from "./format.js";
import "./excluded.css";

const s = en.uf11.excludedScreen;

interface Item {
  id: string;
  name: string;
  areas: string;
  excludedAt: string | null;
}

const byNameThenId = (a: Item, b: Item) =>
  a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function ExcludedBody() {
  const userId = currentUserId();
  const online = useOnline();
  const rows = useExcludedRows(userId);
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
  const focusAfter = useRef<{ id: string | null } | null>(null);
  const tz = useMemo(() => resolveTimeZone(), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadLibrary().catch(() => [] as LibraryExercise[]),
      loadProfile().catch(() => null),
      userId ? loadExcludedIds(userId).catch(() => []) : Promise.resolve([]),
    ]).then(([lib, prof]) => {
      if (cancelled) return;
      setLibrary(lib);
      setProfile(prof);
      setLoaded(true);
    });
    if (navigator.onLine) void refreshExcluded();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const storedIds = useMemo(() => rows.map((r) => r.exerciseId), [rows]);
  const excludedAt = useMemo(() => new Map(rows.map((r) => [r.exerciseId, r.createdAt])), [rows]);

  const noticeAreas = useMemo(
    () => (profile && storedIds.length > 0 ? excludedOutAreas(profile, library, storedIds) : []),
    [profile, library, storedIds],
  );

  const needle = query.trim().toLowerCase();
  const items: Item[] = useMemo(() => {
    const toItem = (id: string, name: string, e: LibraryExercise | undefined): Item => ({
      id,
      name,
      areas: e
        ? primaryAreas(e)
            .map((a) => en.bodyMap.areas[a])
            .join(", ")
        : "",
      excludedAt: excludedAt.get(id) ?? null,
    });
    if (needle === "") {
      return rows
        .map((r) => {
          const e = byId.get(r.exerciseId);
          return toItem(r.exerciseId, e?.name ?? r.exerciseId, e);
        })
        .sort(byNameThenId);
    }
    return library
      .filter((e) => e.kind === "exercise" && e.name.toLowerCase().includes(needle))
      .map((e) => toItem(e.id, e.name, e))
      .sort(byNameThenId);
  }, [needle, rows, library, byId, excludedAt]);

  // Move focus once the list has re-rendered without the included row.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const el = target.id ? buttons.current.get(target.id) : undefined;
    (el ?? searchRef.current)?.focus();
  }, [items]);

  async function toggle(item: Item) {
    if (!userId || !online || pending.has(item.id)) return;
    const isExcluded = item.excludedAt !== null;
    setFailed(false);
    setPending((p) => new Set(p).add(item.id));
    const idx = items.findIndex((i) => i.id === item.id);
    const next = items[idx + 1] ?? items[idx - 1] ?? null;
    try {
      if (isExcluded) await includeExercise(userId, item.id);
      else await excludeExercise(userId, item.id);
      const after = isExcluded ? storedIds.filter((x) => x !== item.id) : [...storedIds, item.id];
      const out = profile ? excludedOutAreas(profile, library, after) : [];
      const names = out.map((a) => en.bodyMap.areas[a]).join(", ");
      const notice =
        out.length === 0
          ? ""
          : out.length === 1
            ? en.excluded.noticeOne(names)
            : en.excluded.noticeMany(names);
      const lead = isExcluded ? s.announceIncluded(item.name) : s.announceExcluded(item.name);
      setStatus(notice ? `${lead}. ${notice}` : lead);
      if (isExcluded && needle === "") focusAfter.current = { id: next?.id ?? null };
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

  return (
    <div className="wl-excluded">
      <p className="wl-muted">{s.lead}</p>
      <ExcludedAreasNotice areas={noticeAreas} />
      {online ? null : (
        <p id={offlineId} className="wl-caption">
          {en.excluded.connectToChange}
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
      {!loaded && rows.length === 0 ? (
        <ul className="wl-excluded__list" aria-label={s.loading} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="wl-excluded__skeleton" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="wl-muted wl-excluded__empty">
          {needle === "" ? s.emptyNone : s.emptyQuery(query.trim())}
        </p>
      ) : (
        <ul className="wl-excluded__list" aria-label={s.list}>
          {items.map((item) => {
            const isExcluded = item.excludedAt !== null;
            const isPending = pending.has(item.id);
            const disabled = !online || isPending;
            return (
              <li key={item.id} className="wl-card wl-excluded__row" data-exercise-id={item.id}>
                <span className="wl-excluded__text">
                  <span className="wl-plan__name">{item.name}</span>
                  {item.areas ? <span className="wl-caption">{item.areas}</span> : null}
                  {isExcluded ? (
                    <span className="wl-caption">
                      {needle === ""
                        ? s.excludedOn(formatInstantDay(item.excludedAt!, tz))
                        : s.excludedPlain}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) buttons.current.set(item.id, el);
                    else buttons.current.delete(item.id);
                  }}
                  className="wl-button--secondary wl-excluded__button"
                  aria-label={isExcluded ? s.includeName(item.name) : s.excludeName(item.name)}
                  aria-disabled={disabled ? "true" : undefined}
                  aria-describedby={online ? undefined : offlineId}
                  onClick={() => {
                    if (disabled) return;
                    void toggle(item);
                  }}
                >
                  {isPending ? s.saving : isExcluded ? s.includeAgain : s.exclude}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
