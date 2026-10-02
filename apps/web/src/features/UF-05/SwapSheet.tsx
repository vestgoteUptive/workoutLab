// UF-05.1 Swap sheet (T-0421, D-0069 §5, D-0071 §7, D-0142 §5).
//
// Principle 3: the engine picks, the sheet only displays. The rows are `rankSwaps` exactly as
// returned (never re-sorted, never filtered), and "Use …" hands `applySwap`'s result to
// `onApply` unchanged. The sheet builds no item and computes no total.
//
// Principle 1: it is a dialog with one task (pick a replacement) and no link out of the session.
// It renders inside UF-09, so it reads IndexedDB only and calls no `refresh*` (D-0111 §11).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  applySwap,
  rankSwaps,
  type EngineProfile,
  type HistorySet,
  type LibraryExercise,
  type SwapCandidate,
  type SwapReason,
  type Workout,
} from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import { loadEngineHistory } from "../../lib/offline/engine-feed.js";
import { loadLibrary, loadProfile } from "../../lib/offline/history.js";
import { equipmentText, matchText, minutesText } from "./labels.js";
import "./uf-05.css";

export interface SwapSheetProps {
  workout: Workout;
  itemIndex: number;
  onApply(result: Workout): void | Promise<void>;
  onClose(): void;
  /** The IANA zone the engine counts local days in. Defaults to the device zone. */
  timeZone?: string;
}

interface SheetData {
  history: HistorySet[];
  profile: EngineProfile;
  library: LibraryExercise[];
}

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; data: SheetData };

type Ranking = { ok: true; candidates: SwapCandidate[] } | { ok: false };

type Notice = "saveFailed" | "swapFailed" | null;

/** The chip order (D-0069 §5). `null` is "Best match", the UF-05.1 default (D-0025). */
const REASONS: ReadonlyArray<SwapReason | null> = [
  null,
  "equipment_taken",
  "discomfort",
  "variety",
  "short_on_time",
];

function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function reasonLabel(reason: SwapReason | null): string {
  return reason === null ? en.uf05.chips.best : en.uf05.chips[reason];
}

function isPromise(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

async function loadSheetData(): Promise<SheetData | null> {
  const [history, profile, library] = await Promise.all([
    loadEngineHistory(),
    loadProfile(),
    loadLibrary(),
  ]);
  if (profile === null) return null;
  // The cache holds the shared contract rows; the engine's `LibraryExercise` is the same shape
  // with a looser `incrementKg` (bodyweight rows).
  return { history, profile, library: library as LibraryExercise[] };
}

/**
 * The UF-05.1 swap sheet. A mount may keep it open across prop changes: when `itemIndex` or the
 * current item's `exerciseId` changes, the sheet resets to Best match with the first row selected
 * and no notice (D-0160). A new `workout` object for the same slot (for example after the host
 * re-reads the plan) keeps the chosen reason and row.
 */
export function SwapSheet({ workout, itemIndex, onApply, onClose, timeZone }: SwapSheetProps) {
  const titleId = useId();
  const groupName = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // One `now` for the sheet's life, so the ranking and the swap see the same window.
  const [now] = useState(() => new Date().toISOString());
  const tz = timeZone ?? deviceZone();
  const current = workout.plan.items[itemIndex];

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reason, setReason] = useState<SwapReason | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // A different slot is a different task: start over from Best match (D-0160).
  const slotKey = `${itemIndex}:${current?.exerciseId ?? ""}`;
  const [shownSlot, setShownSlot] = useState(slotKey);
  if (shownSlot !== slotKey) {
    setShownSlot(slotKey);
    setReason(null);
    setSelectedId(null);
    setNotice(null);
  }
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    loadSheetData().then(
      (data) => {
        if (!cancelled) setLoad(data === null ? { status: "failed" } : { status: "ready", data });
      },
      () => {
        if (!cancelled) setLoad({ status: "failed" });
      },
    );
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  const ranking = useMemo<Ranking | null>(() => {
    if (load.status !== "ready" || current === undefined) return null;
    const { history, profile, library } = load.data;
    try {
      return {
        ok: true,
        candidates: rankSwaps(
          current.exerciseId,
          reason,
          workout,
          profile,
          library,
          history,
          now,
          tz,
        ),
      };
    } catch {
      // A plan item the library doesn't know (D-0059 (c)) has nothing to rank against.
      return { ok: false };
    }
  }, [load, current, reason, workout, now, tz]);

  // Focus moves in on mount; on unmount it goes back to whatever had it, if that is still there.
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        // aria-modal: keep focus inside the sheet.
        const panel = panelRef.current;
        if (panel === null) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>("button, input:not([disabled])"),
        ).filter((el) => !(el instanceof HTMLInputElement && el.type === "radio" && !el.checked));
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

  const library = load.status === "ready" ? load.data.library : [];
  function nameOf(id: string): string {
    return library.find((e) => e.id === id)?.name ?? id;
  }

  const candidates = ranking?.ok === true ? ranking.candidates : [];
  const selected =
    candidates.find((c) => c.exerciseId === selectedId) ?? candidates[0] ?? undefined;

  function chooseReason(next: SwapReason | null): void {
    setReason(next);
    setSelectedId(null);
    setNotice(null);
  }

  function use(): void {
    if (pendingRef.current || selected === undefined || current === undefined) return;
    if (load.status !== "ready") return;
    const { history, profile, library: lib } = load.data;
    let result: Workout;
    try {
      result = applySwap(
        workout,
        current.exerciseId,
        selected.exerciseId,
        reason,
        history,
        profile,
        lib,
        now,
        tz,
      );
    } catch {
      setNotice("swapFailed");
      return;
    }
    setNotice(null);
    let returned: unknown;
    try {
      returned = onApply(result);
    } catch {
      setNotice("saveFailed");
      return;
    }
    if (!isPromise(returned)) return;
    pendingRef.current = true;
    setPending(true);
    Promise.resolve(returned).then(
      () => {
        pendingRef.current = false;
        if (mounted.current) setPending(false);
      },
      () => {
        pendingRef.current = false;
        if (mounted.current) {
          setPending(false);
          setNotice("saveFailed");
        }
      },
    );
  }

  const failed =
    load.status === "failed" || current === undefined || (ranking !== null && !ranking.ok);
  const title =
    load.status === "ready" && current !== undefined
      ? en.uf05.title(nameOf(current.exerciseId))
      : en.uf05.titleFallback;

  return (
    <div className="wl-uf05">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="wl-uf05__panel"
        data-screen-id="UF-05.1"
      >
        <h2 id={titleId} className="wl-uf05__title">
          {title}
        </h2>
        {failed ? (
          <p className="wl-uf05__message">{en.uf05.loadFailed}</p>
        ) : ranking === null ? (
          <p className="wl-uf05__message">{en.uf05.loading}</p>
        ) : (
          <>
            <div role="radiogroup" aria-label={en.uf05.chipsLabel} className="wl-uf05__chips">
              {REASONS.map((r) => (
                <label key={r ?? "best"} className="wl-uf05__chip">
                  <input
                    type="radio"
                    name={`${groupName}-reason`}
                    checked={reason === r}
                    onChange={() => chooseReason(r)}
                  />
                  <span>{reasonLabel(r)}</span>
                </label>
              ))}
            </div>
            {candidates.length === 0 ? (
              <p className="wl-uf05__message">{en.uf05.empty}</p>
            ) : (
              <>
                <div
                  role="radiogroup"
                  aria-label={en.uf05.replacementLabel}
                  className="wl-uf05__rows"
                >
                  {candidates.map((c) => (
                    <label key={c.exerciseId} className="wl-uf05__row" data-id={c.exerciseId}>
                      <input
                        type="radio"
                        name={`${groupName}-candidate`}
                        value={c.exerciseId}
                        checked={selected?.exerciseId === c.exerciseId}
                        onChange={() => {
                          setSelectedId(c.exerciseId);
                          setNotice(null);
                        }}
                      />
                      <span className="wl-uf05__row-body">
                        <span className="wl-uf05__name" data-field="name">
                          {nameOf(c.exerciseId)}
                        </span>
                        <span className="wl-uf05__facts">
                          <span data-field="match">{matchText(c)}</span>
                          <span data-field="minutes">{minutesText(c)}</span>
                          <span data-field="equipment">{equipmentText(c.equipment)}</span>
                        </span>
                        {c.bestMatch || !c.fitsBudget ? (
                          <span className="wl-uf05__tags">
                            {c.bestMatch ? (
                              <span className="wl-uf05__tag" data-tag="best-match">
                                {en.uf05.tagBestMatch}
                              </span>
                            ) : null}
                            {c.fitsBudget ? null : (
                              <span className="wl-uf05__tag" data-tag="over-time">
                                {en.uf05.tagOverTime}
                              </span>
                            )}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
                {selected === undefined ? null : (
                  <button
                    type="button"
                    className="wl-uf05__use"
                    aria-disabled={pending ? "true" : undefined}
                    onClick={use}
                  >
                    {en.uf05.use(nameOf(selected.exerciseId))}
                  </button>
                )}
              </>
            )}
          </>
        )}
        <p role="status" aria-live="polite" className="wl-uf05__notice">
          {notice === null ? null : en.uf05[notice]}
        </p>
        <button type="button" className="wl-uf05__close" onClick={onClose}>
          {en.uf05.close}
        </button>
      </div>
    </div>
  );
}
