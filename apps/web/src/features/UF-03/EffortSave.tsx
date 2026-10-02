// UF-03.3 effort 1–5 and "Save workout" (T-0420, D-0030, D-0068 §2, D-0071 §6, D-0142 §4).
// Shown only on an ended summary. Save re-reads the stored row at the tap and writes the whole of
// it, with `effort_rating`, through the offline queue: the stored `ended_at` goes back unchanged
// and no Edge Function is called in v1 (D-0068 §2, D-0071 §8). It resolves once IndexedDB has
// the row, so it works with no network (NFR-OFF-2), then replaces the route with `/`, but only
// while the summary is still mounted (D-0153 §5).
//
// Which rating (D-0153 §4): a chip picked during this mount is sent as picked. With no pick, Save
// sends the merged `loadSessions()` view's rating read at the tap, so a newer rating another
// device saved isn't overwritten by the raw queued value (D-0148 §3, D-0151 §4).
//
// The chips are native radios sharing one `name`, so the arrow keys move the selection the
// browser's way. None is checked unless the stored row has a rating (D-0142 §4).
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { en } from "../../lib/i18n/en.js";
import { loadSessions, offlineDb, upsertSession } from "../../lib/offline/index.js";
import { EFFORT_RATINGS, viewEffort, type EffortRating } from "./summary-data.js";

export interface EffortSaveProps {
  sessionId: string;
  /** The view's rating at load, which preselects its chip; `null` checks nothing. */
  initialRating: EffortRating | null;
}

type SaveState = "idle" | "pending" | "failed";

export function EffortSave({ sessionId, initialRating }: EffortSaveProps) {
  const navigate = useNavigate();
  const nameId = useId();
  const [rating, setRating] = useState<EffortRating | null>(initialRating);
  const [state, setState] = useState<SaveState>("idle");
  // A ref, not the state: two clicks in one tick both see `idle` in their closures.
  const inFlight = useRef(false);
  // D-0153 §4: set by a chip pick during this mount; a pick back to the preselected value counts.
  const touched = useRef(false);
  // D-0153 §5: a write that resolves after the summary unmounted neither navigates nor renders.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pick = (value: EffortRating) => {
    // AC-4: while the write is held, the value being saved can't change under it.
    if (inFlight.current) return;
    touched.current = true;
    setRating(value);
  };

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("pending");
    try {
      // Read at the tap, not at mount (D-0071 §6): the row may have changed since.
      const entry = await offlineDb().sessions.get(sessionId);
      if (!entry) throw new Error("UF-03.3: the session row is gone");
      const effort = touched.current
        ? rating
        : viewEffort(await loadSessions(), sessionId, entry.row.effort_rating);
      await upsertSession({ ...entry.row, effort_rating: effort });
      if (mounted.current) navigate("/", { replace: true });
    } catch {
      inFlight.current = false;
      if (mounted.current) setState("failed");
    }
  };

  return (
    <div className="wl-uf03-summary__effort" data-part="effort-save">
      <div role="radiogroup" aria-labelledby={nameId} className="wl-uf03-summary__chips-group">
        <p id={nameId} className="wl-uf03-summary__heading">
          {en.uf03.effortName}
        </p>
        <div className="wl-uf03-summary__chips">
          {EFFORT_RATINGS.map((value) => (
            <label key={value} className="wl-uf03-summary__chip" data-effort={value}>
              <input
                type="radio"
                name={`${nameId}-effort`}
                value={value}
                checked={rating === value}
                onChange={() => pick(value)}
              />
              <span>{en.uf03.effort[value]}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="wl-uf03-summary__save"
        aria-disabled={state === "pending" ? "true" : "false"}
        onClick={() => void save()}
      >
        {en.uf03.save}
      </button>

      <p className="wl-uf03-summary__save-status" data-part="save-status" aria-live="polite">
        {state === "failed" ? en.uf03.saveFailed : null}
      </p>
    </div>
  );
}
