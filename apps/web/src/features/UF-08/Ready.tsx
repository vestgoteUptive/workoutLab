// UF-08.4 Ready (T-0303d, D-0065 §6-§7, D-0110). The engine's numbers for the plan about to start,
// the 4-step focus-mode explainer (principle 1), the three focus-mode device settings, and Start.
//
// Start writes the `sessions` row through the offline queue (IndexedDB first, online the same as
// offline, D-0110 §5) and navigates into focus mode only once that write has resolved
// (NFR-OFF-2), by a REPLACE (D-0110 §4). Start itself makes no network call; AutoSync sends the
// row at its next trigger (D-0112 §3).
//
// One session id per visit to this step (D-0110 §3): made on the first tap, reused by a retry
// after a rejected write, dropped when the step unmounts (Back), so the next visit makes a new one.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Workout } from "@workoutlab/engine";
import { formatTime } from "../../lib/format/intl.js";
import { en } from "../../lib/i18n/en.js";
import { upsertSession, type SessionInsert } from "../../lib/offline/queue.js";
import { readFocusPrefs, writeFocusPrefs, type FocusPrefs } from "./focus-prefs.js";

export interface ReadyProps {
  /** The host's current UF-08.2 `Workout`. */
  workout: Workout;
  /** Read once at mount (done by) and once per Start tap (`started_at`), D-0110 §1. */
  clock: () => Date;
  locale: string;
  timeZone: string;
}

const SUGGESTED_HREF = "/session/setup?step=suggested";

/** The summary line (D-0110 §2): m = ceil(totalS / 60), s = Σ sets + the back-off sets. */
function summary(workout: Workout, readyAt: Date, locale: string, timeZone: string): string {
  const { items, warmup } = workout.plan;
  const minutes = Math.ceil(workout.totalS / 60);
  const doneBy = formatTime(new Date(readyAt.getTime() + minutes * 60_000).toISOString(), {
    locale,
    timeZone,
  });
  if (items.length === 0) {
    return warmup.length === 0
      ? en.uf08.readyNothing(doneBy)
      : en.uf08.readyWarmupOnly(minutes, doneBy);
  }
  const sets = items.reduce((sum, i) => sum + i.sets + (i.backoff ? 1 : 0), 0);
  return en.uf08.readySummary(minutes, warmup.length > 0, items.length, sets, doneBy);
}

const PREFS = [
  { key: "sound", label: en.uf08.prefSound },
  { key: "voice", label: en.uf08.prefVoice },
  { key: "keepAwake", label: en.uf08.prefKeepAwake },
] as const satisfies readonly { key: keyof FocusPrefs; label: string }[];

export function Ready({ workout, clock, locale, timeZone }: ReadyProps) {
  const navigate = useNavigate();
  const [readyAt] = useState(() => clock());
  const [prefs, setPrefs] = useState<FocusPrefs>(() => readFocusPrefs());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sessionId = useRef<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const toggle = (key: keyof FocusPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writeFocusPrefs(next);
  };

  const onStart = async () => {
    if (busy.current) return;
    busy.current = true;
    sessionId.current ??= crypto.randomUUID();
    const id = sessionId.current;
    const row: SessionInsert = {
      id,
      started_at: clock().toISOString(),
      ended_at: null,
      time_budget_min: workout.budgetMin,
      energy: workout.energy,
      warmup_in_budget: workout.warmupInBudget,
      plan: workout.plan,
    };
    setFailed(false);
    setPending(true);
    try {
      await upsertSession(row);
    } catch {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        setFailed(true);
      }
      return;
    }
    busy.current = false;
    if (!mounted.current) return;
    setPending(false);
    void navigate(`/session/${id}`, { replace: true });
  };

  return (
    <section data-screen-id="UF-08.4" className="wl-uf08" data-items={workout.plan.items.length}>
      <div className="wl-uf08__top">
        <Link className="wl-uf08__back" to={SUGGESTED_HREF}>
          {en.uf08.back}
        </Link>
      </div>
      <h1 className="wl-uf08__title">{en.uf08.readyTitle}</h1>
      <p className="wl-uf08__fit" data-part="summary">
        {summary(workout, readyAt, locale, timeZone)}
      </p>

      <div className="wl-uf08__card">
        <h2 className="wl-uf08__label">{en.uf08.explainerTitle}</h2>
        <ol className="wl-uf08__how" data-part="explainer">
          {en.uf08.explainer.map((step) => (
            <li key={step.title} className="wl-uf08__how-step">
              <span className="wl-uf08__how-title" data-part="explainer-title">
                {step.title}
              </span>
              <span className="wl-uf08__how-body">{step.body}</span>
            </li>
          ))}
        </ol>
      </div>

      <fieldset className="wl-uf08__prefs">
        <legend className="wl-uf08__label">{en.uf08.prefsName}</legend>
        {PREFS.map(({ key, label }) => (
          <label key={key} className="wl-uf08__toggle wl-uf08__pref" data-pref={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              className="wl-uf08__checkbox"
              checked={prefs[key]}
              onChange={(e) => toggle(key, e.target.checked)}
            />
          </label>
        ))}
      </fieldset>

      {failed ? (
        <p role="alert" className="wl-uf08__error" data-part="start-error">
          {en.uf08.startFailed}
        </p>
      ) : null}

      <button
        type="button"
        className="wl-uf08__primary"
        aria-disabled={pending ? "true" : undefined}
        onClick={() => void onStart()}
      >
        {en.uf08.start}
      </button>
    </section>
  );
}
