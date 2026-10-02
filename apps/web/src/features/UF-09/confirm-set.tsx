// UF-09.4 Confirm set (T-0304b, T-0409, D-0066 §4 §5, D-0118 §2–§6, D-0128 §4). The set is already recorded; this
// screen only corrects it. An untouched confirm auto-saves after 5 s from the wall clock (the
// machine's persisted `confirm` timer, NFR-TIME-1). A `pointerdown` or `keydown` inside this view
// (not the chrome) cancels it; programmatic focus doesn't. Edits live here, so a reload or a
// Pause → Resume shows the recorded values again, with no auto-save.
import { useEffect, useId, useRef, useState } from "react";
import { formatDecimal } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import type { LoggedSet } from "./machine.js";
import { useFocusSession } from "./session.js";
import { remainingS } from "./timer.js";
import type { ViewProps } from "./views.js";
import { parseWeight, stepWeight } from "./weight-input.js";

/** The `docs/data-model.md` default `incrementKg` for an exercise with no library entry. */
const DEFAULT_INCREMENT_KG = 2.5;

/** RIR choices (D-0066 §5): None / 1–2 / 3+ store 0 / 2 / 3. */
const RIR_CHOICES = [
  { value: 0, label: en.uf09.rirNone },
  { value: 2, label: en.uf09.rirFew },
  { value: 3, label: en.uf09.rirMany },
] as const;

/** The entry recorded for the set on screen (the newest one at that position). */
function recordedSet(state: ViewProps["state"]): LoggedSet | null {
  let found: LoggedSet | null = null;
  for (const s of state.loggedSets) {
    if (s.itemIndex === state.itemIndex && s.setIndex === state.setIndex) found = s;
  }
  return found;
}

export function ConfirmSet({ state, ctx, locale, nowMs, onCancelAutosave, onSaved }: ViewProps) {
  const session = useFocusSession();
  const item = ctx.plan.items[state.itemIndex]!;
  const exercise = ctx.library.find((e) => e.id === item.exerciseId);
  const bodyweight = exercise?.externalLoad === false;
  const increment =
    exercise && exercise.incrementKg > 0 ? exercise.incrementKg : DEFAULT_INCREMENT_KG;
  const recorded = recordedSet(state);

  const [reps, setReps] = useState<number | null>(recorded?.reps ?? null);
  // The text the field opened with (D-0128 §4). While the field still reads it, it stands for
  // `recorded.weightKg` exactly, so a 3-decimal 82.125 shown as "82.13" isn't saved as 82.13.
  const [openingText] = useState(
    recorded?.weightKg == null ? "" : formatDecimal(recorded.weightKg, locale),
  );
  const [weightText, setWeightText] = useState(openingText);
  const [rir, setRir] = useState<number | null>(recorded?.rir ?? null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const rirLabelId = useId();
  const rirName = useId();
  const hintId = useId();

  useEffect(() => {
    // Programmatic focus is not a touch (D-0118 §3): the auto-save keeps running.
    saveRef.current?.focus();
  }, []);

  const unedited = weightText === openingText;
  const parsed = parseWeight(weightText);
  const invalid = !bodyweight && !unedited && !parsed.ok;
  const weightKg =
    bodyweight || unedited ? (recorded?.weightKg ?? null) : parsed.ok ? parsed.value : null;

  const edit = <T,>(set: (value: T) => void) => {
    return (value: T) => {
      onCancelAutosave();
      setFailed(false);
      set(value);
    };
  };
  const changeReps = edit(setReps);
  const changeWeight = edit(setWeightText);
  const changeRir = edit(setRir);

  const onSave = () => {
    if (pending.current || invalid) return;
    if (!recorded) {
      onSaved();
      return;
    }
    const changed =
      reps !== recorded.reps || weightKg !== recorded.weightKg || rir !== recorded.rir;
    // Nothing changed: no `editSet`, so `edited_at` isn't bumped for nothing (D-0118 §4).
    if (!changed) {
      onSaved();
      return;
    }
    pending.current = true;
    onCancelAutosave();
    setSaving(true);
    setFailed(false);
    const patch = { reps, weightKg, rir };
    session.editSet(recorded.clientId, patch).then(
      () => onSaved({ ...recorded, ...patch }),
      () => {
        pending.current = false;
        setSaving(false);
        setFailed(true);
      },
    );
  };

  return (
    <div
      className="wl-uf09__view"
      data-field="confirm"
      onPointerDown={onCancelAutosave}
      onKeyDown={onCancelAutosave}
    >
      <h1 className="wl-uf09__title">{exercise?.name ?? item.exerciseId}</h1>
      <div className="wl-uf09__field" role="group" aria-label={en.uf09.repsLabel}>
        <button
          type="button"
          className="wl-uf09__stepper"
          aria-label={en.uf09.fewerReps}
          onClick={() => changeReps(Math.max(0, (reps ?? 0) - 1))}
        >
          −
        </button>
        <span className="wl-uf09__value" data-field="reps">
          {reps ?? 0}
        </span>
        <button
          type="button"
          className="wl-uf09__stepper"
          aria-label={en.uf09.moreReps}
          onClick={() => changeReps((reps ?? 0) + 1)}
        >
          +
        </button>
      </div>
      {bodyweight ? null : (
        <div className="wl-uf09__field">
          <button
            type="button"
            className="wl-uf09__stepper"
            aria-label={en.uf09.lessWeight}
            onClick={() => changeWeight(formatDecimal(stepWeight(weightText, -increment), locale))}
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            className="wl-uf09__input"
            aria-label={en.uf09.weightLabel}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={hintId}
            value={weightText}
            onChange={(e) => changeWeight(e.target.value)}
          />
          <button
            type="button"
            className="wl-uf09__stepper"
            aria-label={en.uf09.moreWeight}
            onClick={() => changeWeight(formatDecimal(stepWeight(weightText, increment), locale))}
          >
            +
          </button>
        </div>
      )}
      {bodyweight ? null : (
        <p id={hintId} className="wl-uf09__status" aria-live="polite">
          {invalid ? en.uf09.weightHint(formatDecimal(82.5, locale)) : null}
        </p>
      )}
      <div className="wl-uf09__rir" role="radiogroup" aria-labelledby={rirLabelId}>
        <span id={rirLabelId} className="wl-uf09__label">
          {en.uf09.rirLabel}
        </span>
        {RIR_CHOICES.map((choice) => (
          <label key={choice.value} className="wl-uf09__radio">
            <input
              type="radio"
              name={rirName}
              checked={rir === choice.value}
              onChange={() => changeRir(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
      <p className="wl-uf09__autosave" data-field="autosave">
        {state.timer ? en.uf09.autosaveIn(remainingS(state.timer, nowMs)) : en.uf09.autosaveOff}
      </p>
      <button
        ref={saveRef}
        type="button"
        className="wl-uf09__primary wl-uf09__save"
        data-action="primary"
        data-state={saving ? "saving" : undefined}
        aria-busy={saving ? true : undefined}
        aria-disabled={invalid || saving ? true : undefined}
        onClick={onSave}
      >
        {en.uf09.save}
      </button>
      <p className="wl-uf09__status" aria-live="polite">
        {failed ? en.uf09.saveError : null}
      </p>
    </div>
  );
}
