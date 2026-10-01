// UF-01.4 Schedule & plan (prototype `UF01-4-Schedule.dc.html`, D-0064 §4–§8, D-0098). Two
// rhythm steppers, "at least" and "at most" sessions per week (1–7), and the plan card built
// from `deriveTargets` (principle 3). This is the only UF-01 module that imports the engine, and
// the splat loads it through `React.lazy`, so the `/welcome` first chunk never holds the engine
// (principle 5). The pending-plan module arrives as the `store` prop (see `WelcomeRoutes.tsx`).
//
// The first commit with the card sets `planShown: true` (D-0098) and, when UF-01.1 started the
// clock, `timingMs = now − startedAtMs` (D-0064 §7). Neither is ever recomputed once set.
import { useLayoutEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { deriveTargets } from "@workoutlab/engine";
import { useAuth } from "../../lib/auth/auth-context.js";
import { en } from "../../lib/i18n/en.js";
import type { PendingPlanStore } from "./WelcomeRoutes.js";
import { PlanCard } from "./PlanCard.js";
import { StepHeader } from "./StepHeader.js";

const t = en.uf01.schedule;

export const RHYTHM_MIN = 1;
export const RHYTHM_MAX = 7;

interface Rhythm {
  min: number;
  max: number;
}

/** D-0064 §4: raising min above max pushes max up; lowering max below min pushes min down. */
function step(r: Rhythm, which: "min" | "max", delta: 1 | -1): Rhythm {
  if (which === "min") {
    const min = Math.min(RHYTHM_MAX, Math.max(RHYTHM_MIN, r.min + delta));
    return { min, max: Math.max(r.max, min) };
  }
  const max = Math.min(RHYTHM_MAX, Math.max(RHYTHM_MIN, r.max + delta));
  return { min: Math.min(r.min, max), max };
}

function StepButton({
  label,
  disabled,
  onActivate,
  children,
}: {
  label: string;
  disabled: boolean;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="wl-uf01__step"
      aria-label={label}
      aria-disabled={disabled ? "true" : "false"}
      onClick={() => {
        if (!disabled) onActivate();
      }}
    >
      {children}
    </button>
  );
}

const MINUS = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
const PLUS = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

function Stepper({
  id,
  label,
  value,
  valueName,
  up,
  down,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  id: string;
  label: string;
  value: number;
  valueName: string;
  up: string;
  down: string;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="wl-uf01__stepper" role="group" aria-labelledby={`${id}-label`}>
      <p id={`${id}-label`} className="wl-uf01__tag">
        {label}
      </p>
      <div className="wl-uf01__stepper-row">
        <StepButton label={down} disabled={!canDown} onActivate={onDown}>
          {MINUS}
        </StepButton>
        <p className="wl-uf01__stepper-value" aria-live="polite" data-field={id}>
          <span aria-hidden="true">{String(value)}</span>
          <span className="wl-uf01__sr">{valueName}</span>
        </p>
        <StepButton label={up} disabled={!canUp} onActivate={onUp}>
          {PLUS}
        </StepButton>
      </div>
      <p className="wl-uf01__muted wl-uf01__stepper-unit">{t.perWeek}</p>
    </div>
  );
}

export function ScheduleScreen({ store }: { store: PendingPlanStore }) {
  const { initialAnswers, readPendingPlan, updatePendingPlan } = store;
  const { status } = useAuth();
  const [answers] = useState(() => initialAnswers());
  const [rhythm, setRhythm] = useState<Rhythm>({
    min: answers.rhythmMin,
    max: answers.rhythmMax,
  });
  const targets = deriveTargets({
    rhythmMin: rhythm.min,
    rhythmMax: rhythm.max,
    priorityAreas: [],
  });

  // The first commit with the plan card (it renders synchronously with this screen).
  useLayoutEffect(() => {
    const now = Date.now();
    const current = readPendingPlan(now);
    const startedAtMs = current?.startedAtMs ?? null;
    const timingMs =
      current?.timingMs ?? (startedAtMs === null ? null : Math.max(0, now - startedAtMs));
    updatePendingPlan({ planShown: true, timingMs }, now);
  }, []);

  function change(which: "min" | "max", delta: 1 | -1) {
    const next = step(rhythm, which, delta);
    if (next.min === rhythm.min && next.max === rhythm.max) return;
    setRhythm(next);
    updatePendingPlan({ rhythmMin: next.min, rhythmMax: next.max });
  }

  const saveTo = status === "signed-out" ? "/account" : "/welcome/save";

  return (
    <div data-screen-id="UF-01.4" className="wl-uf01">
      <StepHeader step={3} backTo="/welcome/level" />
      <div className="wl-uf01__intro">
        <h1 className="wl-uf01__title wl-uf01__title--step">{t.heading}</h1>
        <p className="wl-uf01__muted">{t.subtitle}</p>
      </div>
      <div className="wl-uf01__steppers">
        <Stepper
          id="rhythm-min"
          label={t.minLabel}
          value={rhythm.min}
          valueName={t.minValueName(String(rhythm.min))}
          up={t.minUp}
          down={t.minDown}
          canUp={rhythm.min < RHYTHM_MAX}
          canDown={rhythm.min > RHYTHM_MIN}
          onUp={() => change("min", 1)}
          onDown={() => change("min", -1)}
        />
        <Stepper
          id="rhythm-max"
          label={t.maxLabel}
          value={rhythm.max}
          valueName={t.maxValueName(String(rhythm.max))}
          up={t.maxUp}
          down={t.maxDown}
          canUp={rhythm.max < RHYTHM_MAX}
          canDown={rhythm.max > RHYTHM_MIN}
          onUp={() => change("max", 1)}
          onDown={() => change("max", -1)}
        />
      </div>
      <PlanCard
        goal={answers.goal}
        level={answers.level}
        equipmentProfile={answers.equipmentProfile}
        rhythmMin={rhythm.min}
        rhythmMax={rhythm.max}
        targets={targets}
      />
      <div className="wl-uf01__actions">
        <Link to={saveTo} className="wl-uf01__primary">
          {en.uf01.schedule.save}
        </Link>
      </div>
    </div>
  );
}
