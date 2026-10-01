// UF-01.2 Goal (prototype `UF01-2-Goal.dc.html`, D-0064 §1–§2): the 3 `Goal` values in enum
// order, "Build muscle" preselected. Every change rewrites the pending plan (D-0064 §6).
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Goal } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import { GOALS, initialAnswers, updatePendingPlan } from "./pending-plan.js";
import { StepHeader } from "./StepHeader.js";
import "./uf-01.css";

const t = en.uf01;

export function GoalScreen() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState<Goal>(() => initialAnswers().goal);

  function choose(next: Goal) {
    setGoal(next);
    updatePendingPlan({ goal: next });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    updatePendingPlan({ goal });
    navigate("/welcome/level");
  }

  return (
    <div data-screen-id="UF-01.2" className="wl-uf01">
      <StepHeader step={1} backTo="/welcome" />
      <div className="wl-uf01__intro">
        <h1 id="wl-uf01-goal-title" className="wl-uf01__title wl-uf01__title--step">
          {t.goal.heading}
        </h1>
        <p className="wl-uf01__muted">{t.goal.subtitle}</p>
      </div>
      <form className="wl-uf01__form" onSubmit={onSubmit}>
        <div role="radiogroup" aria-labelledby="wl-uf01-goal-title" className="wl-uf01__options">
          {GOALS.map((id) => (
            <label key={id} className="wl-uf01__option">
              <input
                type="radio"
                name="goal"
                value={id}
                checked={goal === id}
                onChange={() => choose(id)}
                className="wl-uf01__radio"
                aria-labelledby={`wl-uf01-goal-${id}`}
                aria-describedby={`wl-uf01-goal-${id}-hint`}
              />
              <span id={`wl-uf01-goal-${id}`} className="wl-uf01__option-label">
                {t.goal.options[id].label}
              </span>
              <span id={`wl-uf01-goal-${id}-hint`} className="wl-uf01__muted">
                {t.goal.options[id].hint}
              </span>
            </label>
          ))}
        </div>
        <button type="submit" className="wl-uf01__primary">
          {t.continue}
        </button>
      </form>
    </div>
  );
}
