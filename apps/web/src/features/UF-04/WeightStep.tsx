// UF-04.2 "Weight step" row (T-0956, D-0251, D-0259 §4–§8). A radiogroup of chips (1.25, 2.5, 5,
// Other) that sets the exercise's own weight step. The write goes through the T-0954 store and
// queue, so it applies at once and works offline. The chip equal to the library default (read
// from the BASE library) is a reset. The caller mounts this only for an exercise with external
// load (the shared `hasExternalLoad` predicate), so a timed or bodyweight exercise has no row.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatDecimal, formatKg } from "../../lib/format/number.js";
import { en } from "../../lib/i18n/en.js";
import { currentUserId } from "../../lib/offline/current-user.js";
import {
  isValidStep,
  resetExerciseStep,
  setExerciseStep,
} from "../../lib/offline/exercise-settings.js";
import { useExerciseSettingErrors, useExerciseSteps } from "../../lib/offline/index.js";
import "./weight-step.css";

const CHIPS = [1.25, 2.5, 5] as const;
const OTHER = CHIPS.length;
const DEBOUNCE_MS = 600;

/** Comma or dot; digits only. `null` when it is not a valid step (empty, text, out of range). */
function parseStep(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const kg = Number(text);
  return isValidStep(kg) ? kg : null;
}

function Check() {
  return (
    <svg
      className="wl-uf04-step__check"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function WeightStep({
  exerciseId,
  defaultKg,
}: {
  exerciseId: string;
  /** The library step, from the base library (not the effective one). */
  defaultKg: number;
}) {
  const userId = currentUserId();
  const { steps, loaded } = useExerciseSteps(userId);
  const { errors, dismiss } = useExerciseSettingErrors(userId);
  const override = steps.get(exerciseId);
  const rejected = errors.some((e) => e.exerciseId === exerciseId);

  const [pending, setPending] = useState<number | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  const ids = { help: useId(), error: useId(), field: useId() };
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const otherChip = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef<number | null>(null);
  const refocus = useRef(false);
  const latest = useRef({ override, defaultKg, exerciseId, rejected });
  latest.current = { override, defaultKg, exerciseId, rejected };

  const offList = override !== undefined && !CHIPS.some((c) => c === override);
  const current = override ?? defaultKg;
  const committedIndex = CHIPS.findIndex((c) => c === current);
  const checked = otherOpen
    ? OTHER
    : pending !== null
      ? CHIPS.findIndex((c) => c === pending)
      : offList
        ? OTHER
        : committedIndex;
  const tabStop = checked === -1 ? 0 : checked;
  const showFailure = failed || rejected;

  // A confirmed change (or a revert) ends the optimistic selection.
  useEffect(() => {
    setPending(null);
  }, [override]);

  // "Use default" leaves the DOM: focus goes to the chip that is now the tab stop.
  useLayoutEffect(() => {
    if (refocus.current && override === undefined) {
      refocus.current = false;
      chipRefs.current[tabStop]?.focus();
    }
  });

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
  }

  // Leaving the screen inside the debounce window still saves the last selection.
  useEffect(
    () => () => {
      const value = waiting.current;
      if (timer.current !== null) clearTimeout(timer.current);
      if (value === null) return;
      const { override: was, defaultKg: base } = latest.current;
      if (value === base && was === undefined) return;
      void (
        value === base ? resetExerciseStep(exerciseId) : setExerciseStep(exerciseId, value)
      ).catch(() => undefined);
    },
    [exerciseId],
  );

  async function commit(value: number): Promise<boolean> {
    clearTimer();
    const { override: was, defaultKg: base } = latest.current;
    const isReset = value === base;
    setFailed(false);
    if (latest.current.rejected) void dismiss(exerciseId);
    if ((isReset && was === undefined) || (!isReset && was === value)) {
      setPending(null);
      return true;
    }
    try {
      if (isReset) await resetExerciseStep(exerciseId);
      else await setExerciseStep(exerciseId, value);
      setStatus(
        isReset ? en.uf04.weightStepReset(formatKg(base)) : en.uf04.weightStepSet(formatKg(value)),
      );
      return true;
    } catch {
      setPending(null);
      setStatus("");
      setFailed(true);
      return false;
    }
  }

  function select(index: number) {
    clearTimer();
    if (index === OTHER) {
      if (!otherOpen) {
        setText(offList && override !== undefined ? formatDecimal(override) : "");
        setInvalid(false);
        setOtherOpen(true);
      }
      setPending(null);
      return;
    }
    const value = CHIPS[index]!;
    setOtherOpen(false);
    setInvalid(false);
    setPending(value);
    waiting.current = value;
    timer.current = setTimeout(() => void commit(value), DEBOUNCE_MS);
  }

  function onChipKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = OTHER;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    chipRefs.current[next]?.focus();
    select(next);
  }

  function onChipClick(index: number) {
    if (index === OTHER) {
      select(OTHER);
      return;
    }
    // Space, Enter and a tap commit at once, with no wait.
    setOtherOpen(false);
    setInvalid(false);
    setPending(CHIPS[index]!);
    void commit(CHIPS[index]!);
  }

  function validate(raw: string): number | null {
    const kg = parseStep(raw);
    setInvalid(kg === null);
    if (kg === null) setStatus("");
    return kg;
  }

  async function save() {
    const kg = validate(text);
    if (kg === null) return;
    setOtherOpen(false);
    setPending(null);
    const ok = await commit(kg);
    if (!ok) return;
    otherChip.current?.focus();
  }

  function cancel() {
    setOtherOpen(false);
    setInvalid(false);
    setPending(null);
    requestAnimationFrame(() => otherChip.current?.focus());
  }

  async function useDefault() {
    refocus.current = true;
    setPending(defaultKg);
    const ok = await commit(defaultKg);
    if (!ok) refocus.current = false;
  }

  const kgLabel = formatKg(current);
  const otherLabel = offList
    ? en.uf04.weightStepOtherValue(formatKg(override))
    : en.uf04.weightStepOther;

  return (
    <div className="wl-uf04-step" data-field="weight-step">
      {loaded ? (
        <>
          <p className="wl-uf04-step__value wl-type-row-title" data-field="weight-step-value">
            {en.uf04.weightStepValue(kgLabel, override !== undefined)}
          </p>
          <p id={ids.help} className="wl-uf04-step__help wl-type-label">
            {en.uf04.weightStepHelp}
          </p>
          <div
            role="radiogroup"
            aria-label={en.uf04.weightStep}
            aria-describedby={ids.help}
            className="wl-uf04-step__chips"
          >
            {CHIPS.map((kg, index) => (
              <button
                key={kg}
                type="button"
                role="radio"
                aria-checked={checked === index}
                aria-label={formatKg(kg)}
                tabIndex={tabStop === index ? 0 : -1}
                className="wl-uf04-step__chip"
                ref={(node) => {
                  chipRefs.current[index] = node;
                }}
                onKeyDown={(e) => onChipKey(e, index)}
                onClick={() => onChipClick(index)}
              >
                {checked === index ? <Check /> : null}
                {formatDecimal(kg)}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={checked === OTHER}
              tabIndex={tabStop === OTHER ? 0 : -1}
              className="wl-uf04-step__chip"
              ref={(node) => {
                chipRefs.current[OTHER] = node;
                otherChip.current = node;
              }}
              onKeyDown={(e) => onChipKey(e, OTHER)}
              onClick={() => onChipClick(OTHER)}
            >
              {checked === OTHER ? <Check /> : null}
              {otherLabel}
            </button>
          </div>
          {override === undefined ? null : (
            <button
              type="button"
              className="wl-button--text wl-uf04-step__default"
              onClick={() => void useDefault()}
            >
              {en.uf04.weightStepUseDefault(formatKg(defaultKg))}
            </button>
          )}
          {otherOpen ? (
            <div className="wl-uf04-step__other">
              <label htmlFor={ids.field} className="wl-type-label">
                {en.uf04.weightStepField}
              </label>
              <input
                id={ids.field}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="wl-uf04-step__input"
                value={text}
                aria-invalid={invalid ? "true" : undefined}
                aria-describedby={invalid ? ids.error : undefined}
                onChange={(e) => {
                  setText(e.target.value);
                  if (invalid && parseStep(e.target.value) !== null) setInvalid(false);
                }}
                onBlur={(e) => {
                  // Tabbing or tapping onto Cancel must not raise an error first.
                  if (
                    e.relatedTarget instanceof HTMLElement &&
                    e.relatedTarget.dataset.step === "cancel"
                  )
                    return;
                  if (text.trim() !== "") validate(text);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancel();
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              {invalid ? (
                <p id={ids.error} className="wl-uf04-step__error wl-type-label">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    aria-hidden="true"
                    focusable="false"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5.5M12 16.5v.01" />
                  </svg>
                  {en.uf04.weightStepInvalid}
                </p>
              ) : null}
              <div className="wl-uf04-step__buttons">
                <button type="button" className="wl-button--secondary" onClick={() => void save()}>
                  {en.uf04.weightStepSave}
                </button>
                <button
                  type="button"
                  data-step="cancel"
                  className="wl-button--secondary"
                  onClick={cancel}
                >
                  {en.uf04.weightStepCancel}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <p role="status" className="wl-uf04-step__status wl-type-label">
        {showFailure ? "" : status}
      </p>
      {showFailure ? (
        <p role="alert" className="wl-uf04-step__fail wl-type-label">
          {en.excluded.saveFailed}
        </p>
      ) : null}
    </div>
  );
}
