// UF-08.2 learning prompt card (T-1003, D-0277, D-0281, UF-08.2.md "Learning prompt card").
// At most one neutral card above the area rows when a swap or removal count reached its threshold.
// The counts come from the on-device ledger plus the account's cached rows (`pendingFromAccount`);
// mount starts the flush and pull (`syncLedgerNow`) and re-reads when it ends. Nothing is written
// without a tap on the yes button; any answer marks the entry asked (synced). The plan on screen
// is never rebuilt: an answer changes the stored lists only.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { primaryAreas, type LibraryExercise } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";
import { excludeExercise, includeExercise } from "../../lib/offline/excluded.js";
import { useOnline } from "../../lib/offline/excluded-hooks.js";
import { markAsked, type PendingItem } from "../../lib/offline/edit-ledger.js";
import { pendingFromAccount, syncLedgerNow } from "../../lib/offline/edit-ledger-sync.js";
import { favoriteExercise, unfavoriteExercise } from "../../lib/offline/favorites.js";
import { exerciseName } from "./rows.js";

export interface LearningCardProps {
  userId: string;
  library: readonly LibraryExercise[];
  /** The screen's mount time (read once, D-0107 §4): the window rules of `pending` use it. */
  now: Date;
  /** Focus lands on the first area row's open button when no Undo or next card takes it. */
  focusFirstRow: () => void;
}

type After =
  | { kind: "yes"; item: PendingItem; name: string }
  | { kind: "undone" }
  | { kind: "no"; name: string };

type FocusTarget = "undo" | "next" | "row";

const UF = en.uf08;
const L = UF.learn;

export function LearningCard({ userId, library, now: mountNow, focusFirstRow }: LearningCardProps) {
  const online = useOnline();
  const [queue, setQueue] = useState<PendingItem[]>([]);
  const [after, setAfter] = useState<After | null>(null);
  const [failed, setFailed] = useState(false);
  const answered = useRef(new Set<string>());
  const busy = useRef(false);
  const focusTarget = useRef<FocusTarget | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const libraryRef = useRef(library);
  libraryRef.current = library;

  // Items whose exercises the library does not know cannot be named, so they are not asked.
  const askable = useCallback((item: PendingItem): boolean => {
    const lib = libraryRef.current;
    const target = item.kind === "swap" ? item.toExerciseId : item.exerciseId;
    return target !== null && lib.some((e) => e.id === target);
  }, []);

  useEffect(() => {
    let alive = true;
    const now = mountNow;
    const refresh = async () => {
      try {
        const items = (await pendingFromAccount(now)).filter(
          (i) => !answered.current.has(i.key) && askable(i),
        );
        if (!alive) return;
        // The card on screen stays first; a later pull only adds behind it.
        setQueue((prev) => {
          const head = prev[0];
          const keep = head !== undefined && items.some((i) => i.key === head.key) ? head : null;
          return keep === null ? items : [keep, ...items.filter((i) => i.key !== keep.key)];
        });
      } catch {
        // The card is a nicety: a failed read shows nothing.
      }
    };
    void refresh();
    void syncLedgerNow()
      .then(refresh)
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // Mount only: one read, one sync per visit to UF-08.2.
  }, []);

  const item = queue[0] ?? null;

  // Focus follows an answer once the element it names is on screen: a render that started before
  // the answer may commit first, so a missing element keeps the request for the next render.
  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    if (target === "row") focusFirstRow();
    else if (target === "next") {
      // The next card's yes button when one took the place, else the first row. A render that
      // still shows the answered card keeps the request.
      if (item !== null && answered.current.has(item.key)) return;
      if (item === null) focusFirstRow();
      else yesRef.current?.focus();
    } else {
      if (undoRef.current === null) return;
      undoRef.current.focus();
    }
    focusTarget.current = null;
  });

  const view = useMemo(() => {
    if (item === null) return null;
    const lib = library;
    if (item.kind === "swap" && item.toExerciseId !== null) {
      const to = lib.find((e) => e.id === item.toExerciseId);
      const area = to === undefined ? null : primaryAreas(to)[0];
      const name = exerciseName(item.toExerciseId, lib);
      return {
        name,
        title: L.swapTitle(name, area === null || area === undefined ? "" : en.bodyMap.areas[area]),
        line: L.swapLine(exerciseName(item.exerciseId, lib), item.total),
        yes: L.preferIt,
        yesName: L.preferName(name),
        reason: en.uf04.connectToChangeFavorites,
      };
    }
    const name = exerciseName(item.exerciseId, lib);
    return {
      name,
      title: L.removalTitle(name),
      line: L.removalLine(item.total),
      yes: L.neverSuggest,
      yesName: L.neverName(name),
      reason: en.excluded.connectToChange,
    };
  }, [item, library]);

  const settle = (next: After, focus: FocusTarget) => {
    if (item === null) return;
    answered.current.add(item.key);
    // A functional update: a pull that finished during the write may have added items behind.
    const key = item.key;
    focusTarget.current = focus === "row" ? "next" : focus;
    setQueue((prev) => prev.filter((i) => i.key !== key));
    setAfter(next);
    setFailed(false);
  };

  const answer = async (yes: boolean) => {
    if (item === null || view === null || !online || busy.current) return;
    busy.current = true;
    try {
      if (yes) {
        if (item.kind === "swap" && item.toExerciseId !== null)
          await favoriteExercise(userId, item.toExerciseId);
        else await excludeExercise(userId, item.exerciseId);
      }
    } catch {
      setFailed(true);
      busy.current = false;
      return;
    }
    let marked = false;
    try {
      marked = await markAsked(item.key, new Date());
    } catch {
      marked = false;
    }
    busy.current = false;
    if (!yes && !marked) {
      // UF-08.2.md "Write failed": the card stays with the retry line; never claim "won't ask again".
      setFailed(true);
      return;
    }
    // A yes whose list write succeeded but whose mark failed still shows its Undo line: the
    // preference is saved, and the entry drops out of `pending` because it is now a favorite or
    // excluded.
    if (yes) settle({ kind: "yes", item, name: view.name }, "undo");
    else settle({ kind: "no", name: view.name }, "row");
  };

  const undo = async () => {
    if (after?.kind !== "yes" || busy.current) return;
    const { item: done } = after;
    busy.current = true;
    try {
      if (done.kind === "swap" && done.toExerciseId !== null)
        await unfavoriteExercise(userId, done.toExerciseId);
      else await includeExercise(userId, done.exerciseId);
    } catch {
      setFailed(true);
      busy.current = false;
      return;
    }
    busy.current = false;
    focusTarget.current = "row";
    setFailed(false);
    setAfter({ kind: "undone" });
  };

  const disabled = !online;

  return (
    <>
      <div role="status" className="wl-uf08__learn-region" data-part="learning-region">
        {after?.kind === "yes" ? (
          <div className="wl-uf08__learn-after" data-part="learning-after">
            <p className="wl-uf08__learn-after-line">
              <span>
                {after.item.kind === "swap" ? L.favoriteNow(after.name) : L.excludedNow(after.name)}
              </span>
              <button
                ref={undoRef}
                type="button"
                className="wl-button--text wl-uf08__learn-undo"
                aria-label={
                  after.item.kind === "swap"
                    ? L.undoFavoriteName(after.name)
                    : L.undoExcludedName(after.name)
                }
                onClick={() => void undo()}
              >
                {UF.undo}
              </button>
            </p>
            <p className="wl-uf08__learn-manage">{L.manage}</p>
          </div>
        ) : null}
        {after?.kind === "undone" ? (
          <p className="wl-uf08__learn-after-line" data-part="learning-after">
            {L.undone}
          </p>
        ) : null}
        {after?.kind === "no" ? (
          <p className="wl-uf08__learn-after-line" data-part="learning-after">
            {L.wontAsk(after.name)}
          </p>
        ) : null}
        {item !== null && view !== null ? (
          <div className="wl-uf08__learn" data-part="learning-card" data-kind={item.kind}>
            <svg
              className="wl-uf08__learn-icon"
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
            <div className="wl-uf08__learn-body">
              <h2 className="wl-uf08__learn-title">{view.title}</h2>
              <p className="wl-uf08__learn-line">{view.line}</p>
              <div className="wl-uf08__learn-actions">
                <button
                  ref={yesRef}
                  type="button"
                  className="wl-button--secondary"
                  data-part="learning-yes"
                  aria-label={view.yesName}
                  aria-disabled={disabled ? "true" : undefined}
                  aria-describedby={disabled ? reasonId : undefined}
                  onClick={() => void answer(true)}
                >
                  {view.yes}
                </button>
                <button
                  type="button"
                  className="wl-button--text"
                  data-part="learning-no"
                  aria-label={L.noThanksName(view.name)}
                  aria-disabled={disabled ? "true" : undefined}
                  aria-describedby={disabled ? reasonId : undefined}
                  onClick={() => void answer(false)}
                >
                  {L.noThanks}
                </button>
              </div>
              {disabled ? (
                <p id={reasonId} className="wl-uf08__learn-reason">
                  {view.reason}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="wl-uf08__learn-error" data-part="learning-error">
          {en.excluded.saveFailed}
        </p>
      ) : null}
    </>
  );
}
