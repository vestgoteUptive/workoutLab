// State and side effects of UF-07.1. Reads come from the `lib/offline` loaders only (D-0067 §3);
// writes are plain supabase-js calls to `routines` and `routine_items` (D-0070 §2, D-0001).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { supabase } from "../../lib/auth/client.js";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import { loadLibrary, loadRoutines, refreshRoutines } from "../../lib/offline/index.js";

export const MAX_ITEMS = 8;
export const MAX_NAME = 40;
const REFRESH_CAP_MS = 3000;
const PLAN_PATH = "/plan";

export type FocusDir = "up" | "down";

/** Runs the promise, but gives up (and never rejects) after the cap or on a failure. */
async function refreshCapped(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, REFRESH_CAP_MS);
  });
  try {
    await Promise.race([Promise.resolve().then(() => refreshRoutines()), cap]);
  } catch {
    // A failed refresh just means the cache stays as it is.
  } finally {
    clearTimeout(timer);
  }
}

/** Runs a read and falls back on any failure, including a loader that throws synchronously. */
async function attempt<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** A step fails when it rejects or resolves with a non-null `error` (supabase-js doesn't throw). */
function check(result: unknown): void {
  const error = (result as { error?: unknown } | null | undefined)?.error;
  if (error) throw error;
}

export function useRoutineEditor(routineId: string | undefined) {
  const routerNavigate = useNavigate();
  // A ref keeps the load effect keyed on the route id alone, whatever the router does with
  // the `navigate` identity.
  const navigateRef = useRef(routerNavigate);
  navigateRef.current = routerNavigate;
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean }) => navigateRef.current(to, options),
    [],
  );
  const online = useOnline();
  const { status: authStatus } = useAuth();
  const isNew = routineId === undefined;

  // D-0081 §4: one id per mount, reused by every Save attempt.
  const [newId] = useState(() => crypto.randomUUID());
  const id = routineId ?? newId;

  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState<LibraryExercise[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadedName, setLoadedName] = useState("");
  // The loaded snapshot's item ids, kept alongside `loadedName` so a later refresh (D-0174 §4)
  // can tell an untouched draft from a touched one, and so Save still compares against what was
  // actually loaded rather than the current draft.
  const [loadedItems, setLoadedItems] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<"save" | "delete" | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = useRef(false);
  const pendingFocus = useRef<{ exerciseId: string; dir: FocusDir } | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  // Where focus goes once the list has re-rendered after a Remove or a picker Add (D-0162 §4).
  const afterChange = useRef<{ kind: "remove"; index: number } | { kind: "add" } | null>(null);
  // D-0174 §4: one mount refresh total, whichever path takes it (the unknown-id refresh below,
  // or the known-id refresh effect further down). Reset whenever `routineId` changes in place.
  const refreshStarted = useRef(false);
  // Latest draft and loaded snapshot, read by the refresh effect without becoming one of its
  // dependencies (so typing doesn't restart or cancel an in-flight refresh).
  const latest = useRef({ name, items, loadedName, loadedItems });
  useEffect(() => {
    latest.current = { name, items, loadedName, loadedItems };
  });

  // Load once per route id. The draft is initialised from the first read that finds the routine.
  // A later refresh may still replace an *untouched* draft (D-0174 §4, amending D-0081 §5); see
  // the refresh effect below.
  useEffect(() => {
    let cancelled = false;
    // AC-6: `routineId` changed in place (no unmount). Clear the previous id's outcome before
    // the new read, so a stale `loadFailed` alert or a stale `ready` form never survives it.
    refreshStarted.current = false;
    setLoadFailed(false);
    setReady(false);
    setLoadedName("");
    setLoadedItems([]);
    setName("");
    setItems([]);
    void (async () => {
      const lib = await attempt(() => loadLibrary(), [] as LibraryExercise[]);
      if (cancelled) return;
      setLibrary(lib);
      setLibraryLoaded(true);
      if (routineId === undefined) {
        // T-0461: a new routine's form waits for the library too, so the picker never opens on
        // an empty list that flashes "No exercises match" before the rows arrive.
        setReady(true);
        return;
      }

      // A cache that can't be read at all (`null`) is not "unknown routine": stay put, and
      // redirect only when a read succeeded and the id really isn't there.
      const read = async () => {
        const routines = await attempt(() => loadRoutines(), null);
        return routines === null ? null : (routines.find((r) => r.id === routineId) ?? undefined);
      };
      let found = await read();
      if (cancelled) return;
      if (found === null) {
        setLoadFailed(true);
        return;
      }
      if (found) {
        // The id is already cached: render it now. The known-id refresh effect below starts
        // this mount's one refresh once online and signed in (D-0174 §4); this branch leaves
        // `refreshStarted` alone so that effect, not this one, is the one that sets it.
        setLoadedName(found.name);
        setLoadedItems(found.items.map((item) => item.exerciseId));
        setName(found.name);
        setItems(found.items.map((item) => item.exerciseId));
        setReady(true);
        return;
      }
      if (navigator.onLine) {
        refreshStarted.current = true;
        await refreshCapped();
        if (cancelled) return;
        found = await read();
        if (cancelled) return;
        if (found === null) {
          setLoadFailed(true);
          return;
        }
      }
      if (!found) {
        navigate(PLAN_PATH, { replace: true });
        return;
      }
      setLoadedName(found.name);
      setLoadedItems(found.items.map((item) => item.exerciseId));
      setName(found.name);
      setItems(found.items.map((item) => item.exerciseId));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [routineId, navigate]);

  // D-0174 §4: for a cached routine, refresh once more on mount so a deep link on a device with
  // a stale cache picks up another device's newer (or deleted) row. Starts only online and
  // signed in (D-0113 §1-§3), at most once per mount — shared with the unknown-id branch above
  // through `refreshStarted`. Never runs for `/plan/routines/new`.
  useEffect(() => {
    if (isNew || !ready || refreshStarted.current) return;
    if (!online || authStatus !== "signed-in") return;
    refreshStarted.current = true;
    let cancelled = false;
    void (async () => {
      // `refreshCapped` never rejects and never hangs past the cap (D-0081 §5, D-0071 §8): a
      // rejected or capped refresh falls straight through to "changes nothing" below.
      await refreshCapped();
      if (cancelled) return;
      const routines = await attempt(() => loadRoutines(), null);
      if (cancelled || routines === null) return;
      const fresh = routines.find((r) => r.id === routineId);
      const {
        name: draftName,
        items: draftItems,
        loadedName: ln,
        loadedItems: li,
      } = latest.current;
      const untouched =
        draftName === ln &&
        draftItems.length === li.length &&
        draftItems.every((v, i) => v === li[i]);
      if (!fresh) {
        if (untouched) navigate(PLAN_PATH, { replace: true });
        return;
      }
      if (!untouched) return;
      const freshItems = fresh.items.map((item) => item.exerciseId);
      setLoadedName(fresh.name);
      setLoadedItems(freshItems);
      setName(fresh.name);
      setItems(freshItems);
    })();
    return () => {
      cancelled = true;
    };
    // `online` and `authStatus` are read here so the effect restarts when either turns true
    // partway through the mount (a stale -> signed-in session, D-0113 §2). `ready` gates the
    // refresh until the first cache read has painted the untouched draft it will compare
    // against.
  }, [routineId, isNew, ready, online, authStatus, navigate]);

  const names = useMemo(() => new Map(library.map((e) => [e.id, e.name])), [library]);
  const nameOf = useCallback((exerciseId: string) => names.get(exerciseId) ?? exerciseId, [names]);

  const pickerRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library
      .filter((e) => e.kind === "exercise")
      .filter((e) => q === "" || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [library, query]);

  // D-0164 §3: no exercise rows at all (unread, empty, or only warm-ups) is not "no match".
  const libraryEmpty = libraryLoaded && !library.some((e) => e.kind === "exercise");

  const trimmed = name.trim();
  const nameValid = trimmed.length >= 1 && trimmed.length <= MAX_NAME;
  const full = items.length >= MAX_ITEMS;
  const canSave = nameValid && items.length >= 1 && online && !saving;

  // Keeps keyboard focus on the row that moved (AC-A4), or on its other arrow at an end.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-exercise]") ?? [],
    ).find((el) => el.dataset.exercise === target.exerciseId);
    const primary = row?.querySelector<HTMLButtonElement>(`[data-move="${target.dir}"]`);
    const other = row?.querySelector<HTMLButtonElement>(
      `[data-move="${target.dir === "up" ? "down" : "up"}"]`,
    );
    (primary && !primary.disabled ? primary : other)?.focus();
  }, [items]);

  const move = (index: number, dir: FocusDir) => {
    const to = dir === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= items.length) return;
    const exerciseId = items[index]!;
    const next = [...items];
    next.splice(index, 1);
    next.splice(to, 0, exerciseId);
    pendingFocus.current = { exerciseId, dir };
    setItems(next);
    setAnnouncement(en.uf07.moved(nameOf(exerciseId), to + 1));
  };

  const remove = (index: number) => {
    const exerciseId = items[index]!;
    afterChange.current = { kind: "remove", index };
    setItems(items.filter((_, i) => i !== index));
    setAnnouncement(en.uf07.removed(nameOf(exerciseId)));
  };

  const add = (exerciseId: string) => {
    if (items.includes(exerciseId) || items.length >= MAX_ITEMS) return;
    afterChange.current = { kind: "add" };
    setItems([...items, exerciseId]);
    setAnnouncement(en.uf07.added(nameOf(exerciseId)));
  };

  const finish = async () => {
    // The write landed. A failed refresh shows nothing: /plan's own refresh catches up.
    try {
      await refreshRoutines();
    } catch {
      // ignored on purpose
    }
    navigate(PLAN_PATH);
  };

  const save = async () => {
    if (busy.current || !canSave) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      // D-0070 §2: three steps in order, each only if the previous one succeeded.
      check(await supabase.from("routines").upsert({ id, name: trimmed }));
      check(
        await supabase
          .from("routine_items")
          .delete()
          .eq("routine_id", id)
          .gte("position", items.length),
      );
      const rows = items.map((exerciseId, position) => ({
        routine_id: id,
        position,
        exercise_id: exerciseId,
        sets: 3,
        reps_min: null,
        reps_max: null,
        duration_s: null,
        progression: "double_progression",
      }));
      check(
        await supabase.from("routine_items").upsert(rows, { onConflict: "routine_id,position" }),
      );
    } catch {
      setError("save");
      setSaving(false);
      busy.current = false;
      return;
    }
    await finish();
  };

  const confirmDelete = async () => {
    if (busy.current || !online) return;
    busy.current = true;
    setConfirmOpen(false);
    setError(null);
    try {
      check(await supabase.from("routines").delete().eq("id", id));
    } catch {
      setError("delete");
      busy.current = false;
      return;
    }
    await finish();
  };

  return {
    ready,
    loadFailed,
    libraryEmpty,
    isNew,
    online,
    name,
    setName,
    loadedName,
    trimmed,
    nameValid,
    items,
    nameOf,
    known: (exerciseId: string) => names.has(exerciseId),
    listRef,
    afterChange,
    pickerOpen,
    setPickerOpen,
    query,
    setQuery,
    pickerRows,
    full,
    canSave,
    saving,
    error,
    announcement,
    confirmOpen,
    setConfirmOpen,
    move,
    remove,
    add,
    save,
    confirmDelete,
    cancel: () => navigate(PLAN_PATH),
  };
}

export type RoutineEditorState = ReturnType<typeof useRoutineEditor>;
