// UF-08 Session setup host (T-0303a, D-0107 §1). One route, `/session/setup`, with the step in
// `?step=`. Setup state (minutes, warm-up, energy, the current `Workout`) lives here, so moving
// between steps is a push inside the same route and the host never remounts.
//
// - `/session/setup` and `?step=time` render UF-08.1.
// - `?step=suggested` renders UF-08.2 only once "Suggest my workout" has handed a `Workout` over.
//   A cold load of it, or of any other step, is replaced by `/session/setup` (no stale step in
//   history, principle 2).
//
// The fit line is the real on-device `suggest()` (principle 3), memoised on its inputs: the data
// object (which `useSetupData` keeps identical while its content is unchanged, D-0107 §3), the
// minutes, the warm-up toggle and the energy.
import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { suggest, type Energy, type Workout } from "@workoutlab/engine";
import { OfflineStatus } from "../../components/offline-status/OfflineStatus.js";
import { formatTime } from "../../lib/format/intl.js";
import { en } from "../../lib/i18n/en.js";
import { Suggested } from "./Suggested.js";
import {
  CHIPS,
  DEFAULT_BUDGET,
  MAX_BUDGET,
  MIN_BUDGET,
  STEP_MIN,
  clampBudget,
  finishInstant,
  finishToBudget,
} from "./time.js";
import { useSetupData, type SetupData } from "./use-setup-data.js";
import "./uf-08.css";

const SETUP_PATH = "/session/setup";
const ENERGIES = ["low", "normal", "high"] as const satisfies readonly Energy[];

export interface SessionSetupProps {
  /** Read once at mount (D-0107 §4). Defaults to the current time. */
  now?: Date | string;
  /** Defaults to `navigator.language` when it is a string, else `"en-GB"`. */
  locale?: string;
  /** The `tz` given to `suggest` and `refreshAll`. Defaults to the device's zone. */
  timeZone?: string;
}

function defaultLocale(): string {
  // Shell tests stub `navigator` as `{onLine}` only, so read nothing else without a guard, and
  // never `navigator.languages`.
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    return navigator.language;
  }
  return "en-GB";
}

function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

interface Inputs {
  budgetMin: number;
  warmupInBudget: boolean;
  energy: Energy;
}

function runSuggest(
  data: SetupData,
  inputs: Inputs,
  nowIso: string,
  timeZone: string,
): Workout | null {
  try {
    return suggest(
      data.history,
      data.targets,
      data.profile,
      data.library,
      {
        budgetMin: inputs.budgetMin,
        warmupInBudget: inputs.warmupInBudget,
        energy: inputs.energy,
        shuffle: 0,
        mainLiftId: null,
        pinnedIds: [],
        excludeIds: [],
      },
      nowIso,
      timeZone,
    );
  } catch {
    // An engine rejection (an unknown goal, say) is shown as the no-profile state, never thrown.
    return null;
  }
}

/** n = items, m = Σ sets + the back-off sets (D-0065 §3). */
function fitLine(workout: Workout): string {
  const items = workout.plan.items;
  if (items.length === 0) return en.uf08.nothingFits(workout.budgetMin);
  const sets = items.reduce((sum, i) => sum + i.sets + (i.backoff ? 1 : 0), 0);
  return en.uf08.fits(items.length, sets);
}

export function SessionSetup({ now, locale, timeZone }: SessionSetupProps = {}) {
  const [nowIso] = useState(() => new Date(now ?? new Date()).toISOString());
  const [loc] = useState(() => locale ?? defaultLocale());
  const [tz] = useState(() => timeZone ?? defaultTimeZone());

  const [budgetMin, setBudgetMin] = useState(DEFAULT_BUDGET);
  const [warmupInBudget, setWarmupInBudget] = useState(true);
  const [energy, setEnergy] = useState<Energy>("normal");
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishValue, setFinishValue] = useState("");
  const [finishError, setFinishError] = useState(false);
  const [handedOff, setHandedOff] = useState(false);

  const state = useSetupData(nowIso, tz);
  const data = state.kind === "ready" ? state.data : null;

  const workout = useMemo(
    () => (data ? runSuggest(data, { budgetMin, warmupInBudget, energy }, nowIso, tz) : null),
    [data, budgetMin, warmupInBudget, energy, nowIso, tz],
  );
  const missing = state.kind === "missing" || (data !== null && workout === null);

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const step = params.get("step");
  const showSuggested = step === "suggested" && handedOff && workout !== null;
  const stale = step !== null && step !== "time" && !showSuggested;

  useEffect(() => {
    if (stale) void navigate(SETUP_PATH, { replace: true });
  }, [stale, navigate]);

  const ids = {
    energy: useId(),
    hint: useId(),
    finish: useId(),
    finishError: useId(),
    warmup: useId(),
  };

  if (showSuggested) return <Suggested workout={workout} />;

  const stepBy = (delta: number) => {
    const next = clampBudget(budgetMin + delta);
    if (next !== budgetMin) setBudgetMin(next);
  };

  const onFinishChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFinishValue(value);
    const result = finishToBudget(value, nowIso, tz);
    if (result.kind === "partial") {
      setFinishError(false);
      return;
    }
    if (result.kind === "rejected") {
      setFinishError(true);
      return;
    }
    setFinishError(false);
    setFinishOpen(false);
    setFinishValue("");
    setBudgetMin(result.budgetMin);
  };

  const onSuggest = () => {
    if (workout === null) return;
    setHandedOff(true);
    void navigate(`${SETUP_PATH}?step=suggested`);
  };

  const atMin = budgetMin <= MIN_BUDGET;
  const atMax = budgetMin >= MAX_BUDGET;
  const ready = workout !== null;

  return (
    <div data-screen-id="UF-08.1" className="wl-uf08">
      <div className="wl-uf08__top">
        <Link to="/" className="wl-uf08__close" aria-label={en.uf08.close}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </Link>
        <OfflineStatus variant="icon" locale={loc} timeZone={tz} />
      </div>
      <h1 className="wl-uf08__title">{en.uf08.title}</h1>

      {missing ? (
        <div className="wl-uf08__missing">
          <p>{en.uf08.missing}</p>
          <Link to="/" className="wl-uf08__link">
            {en.uf08.missingLink}
          </Link>
        </div>
      ) : (
        <>
          <div className="wl-uf08__card">
            <div className="wl-uf08__stepper">
              <button
                type="button"
                className="wl-uf08__step"
                aria-label={en.uf08.minutesLess}
                aria-disabled={atMin ? "true" : "false"}
                onClick={() => {
                  if (!atMin) stepBy(-STEP_MIN);
                }}
              >
                <span aria-hidden="true">−</span>
              </button>
              <div className="wl-uf08__value">
                <span className="wl-uf08__minutes" data-part="minutes">
                  {budgetMin}
                </span>
                <span className="wl-uf08__unit">{en.uf08.minutesUnit}</span>
                <span className="wl-uf08__done-by" data-part="done-by">
                  {en.uf08.doneBy(
                    formatTime(finishInstant(nowIso, budgetMin), { locale: loc, timeZone: tz }),
                  )}
                </span>
              </div>
              <button
                type="button"
                className="wl-uf08__step"
                aria-label={en.uf08.minutesMore}
                aria-disabled={atMax ? "true" : "false"}
                onClick={() => {
                  if (!atMax) stepBy(STEP_MIN);
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div className="wl-uf08__chips" role="group" aria-label={en.uf08.chipsName}>
              {CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="wl-uf08__chip"
                  aria-label={en.uf08.chipName(String(m))}
                  aria-pressed={budgetMin === m ? "true" : "false"}
                  onClick={() => setBudgetMin(m)}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="wl-uf08__finish">
              {finishOpen ? (
                <>
                  <label htmlFor={ids.finish} className="wl-uf08__label">
                    {en.uf08.finishBy}
                  </label>
                  <input
                    id={ids.finish}
                    type="time"
                    className="wl-uf08__time"
                    value={finishValue}
                    onChange={onFinishChange}
                    aria-invalid={finishError ? "true" : "false"}
                    aria-describedby={finishError ? ids.finishError : undefined}
                  />
                  {finishError ? (
                    <p id={ids.finishError} className="wl-uf08__error">
                      {en.uf08.finishRejected}
                    </p>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className="wl-uf08__link"
                  onClick={() => {
                    setFinishOpen(true);
                    setFinishValue("");
                    setFinishError(false);
                  }}
                >
                  {en.uf08.setFinishTime}
                </button>
              )}
            </div>

            <div className="wl-uf08__toggle">
              <label htmlFor={ids.warmup}>{en.uf08.warmupToggle}</label>
              <input
                id={ids.warmup}
                type="checkbox"
                className="wl-uf08__checkbox"
                checked={warmupInBudget}
                onChange={(e) => setWarmupInBudget(e.target.checked)}
              />
            </div>
          </div>

          <div
            role="radiogroup"
            aria-labelledby={ids.energy}
            aria-describedby={ids.hint}
            className="wl-uf08__energy"
          >
            <p id={ids.energy} className="wl-uf08__label">
              {en.uf08.energyName}
            </p>
            <div className="wl-uf08__energy-options">
              {ENERGIES.map((e) => (
                <label key={e} className="wl-uf08__energy-option" data-energy={e}>
                  <input
                    type="radio"
                    name="wl-uf08-energy"
                    value={e}
                    checked={energy === e}
                    onChange={() => setEnergy(e)}
                  />
                  <span>{en.uf08.energy[e]}</span>
                </label>
              ))}
            </div>
            <p id={ids.hint} className="wl-uf08__hint">
              {en.uf08.energyHint[energy]}
            </p>
          </div>

          <p className="wl-uf08__fit" data-part="fit-line" aria-live="polite">
            {workout ? fitLine(workout) : en.uf08.checking}
          </p>

          <button
            type="button"
            className="wl-uf08__primary"
            aria-disabled={ready ? "false" : "true"}
            onClick={onSuggest}
          >
            {en.uf08.suggest}
          </button>
        </>
      )}
    </div>
  );
}
