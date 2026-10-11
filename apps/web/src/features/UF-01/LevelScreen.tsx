// UF-01.3 Level & equipment (prototype `UF01-3-Experience.dc.html`, D-0061 §3, D-0064 §2–§3):
// a level group (Beginner preselected) and the 3 equipment profiles (Full gym preselected).
// Every change rewrites the pending plan (D-0064 §6). The pending-plan module arrives as the
// `store` prop from the splat (see `WelcomeRoutes.tsx`).
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Level } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import type { EquipmentProfileId } from "./equipment-profiles.js";
import type { PendingPlanStore } from "./WelcomeRoutes.js";
import { ArrowRight, Tick } from "./Glyphs.js";
import { StepHeader } from "./StepHeader.js";

const t = en.uf01;

export function LevelScreen({ store }: { store: PendingPlanStore }) {
  const { EQUIPMENT_PROFILE_IDS, LEVELS, initialAnswers, updatePendingPlan } = store;
  const navigate = useNavigate();
  const [initial] = useState(() => initialAnswers());
  const [level, setLevel] = useState<Level>(initial.level);
  const [equipment, setEquipment] = useState<EquipmentProfileId>(initial.equipmentProfile);

  function chooseLevel(next: Level) {
    setLevel(next);
    updatePendingPlan({ level: next });
  }

  function chooseEquipment(next: EquipmentProfileId) {
    setEquipment(next);
    updatePendingPlan({ equipmentProfile: next });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    updatePendingPlan({ level, equipmentProfile: equipment });
    navigate("/welcome/schedule");
  }

  return (
    <div data-screen-id="UF-01.3" data-wl-state="plan" className="wl-page wl-uf01-plan">
      <StepHeader step={2} backTo="/welcome/goal" />
      <h1 className="wl-uf01-plan__title">{t.level.heading}</h1>
      <form className="wl-uf01-plan__form" onSubmit={onSubmit}>
        <div className="wl-uf01-plan__group">
          <p id="wl-uf01-level-legend" className="wl-type-label">
            {t.level.levelLegend}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="wl-uf01-level-legend"
            aria-describedby="wl-uf01-level-hint"
            className="wl-segmented"
          >
            {LEVELS.map((id) => (
              <label key={id}>
                <input
                  type="radio"
                  name="level"
                  value={id}
                  checked={level === id}
                  onChange={() => chooseLevel(id)}
                />
                <span>{t.level.levels[id].label}</span>
              </label>
            ))}
          </div>
          <p id="wl-uf01-level-hint" className="wl-type-label">
            {t.level.levels[level].hint}
          </p>
        </div>
        <div className="wl-uf01-plan__group">
          <p id="wl-uf01-equipment-legend" className="wl-type-label">
            {t.level.equipmentLegend}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="wl-uf01-equipment-legend"
            aria-describedby="wl-uf01-equipment-hint"
            className="wl-uf01-plan__chips"
          >
            {EQUIPMENT_PROFILE_IDS.map((id) => (
              <label key={id} className="wl-chip">
                <input
                  type="radio"
                  name="equipment"
                  value={id}
                  checked={equipment === id}
                  onChange={() => chooseEquipment(id)}
                />
                <Tick className="wl-chip__tick" />
                <span>{t.level.equipment[id]}</span>
              </label>
            ))}
          </div>
          <p id="wl-uf01-equipment-hint" className="wl-type-label">
            {t.level.equipmentHint}
          </p>
        </div>
        <button type="submit" className="wl-button--primary">
          <span>{t.continue}</span>
          <ArrowRight />
        </button>
      </form>
    </div>
  );
}
