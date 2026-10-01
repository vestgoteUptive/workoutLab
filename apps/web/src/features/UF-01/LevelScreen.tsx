// UF-01.3 Level & equipment (prototype `UF01-3-Experience.dc.html`, D-0061 §3, D-0064 §2–§3):
// a level group (Beginner preselected) and the 3 equipment profiles (Full gym preselected).
// Every change rewrites the pending plan (D-0064 §6).
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { Level } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import { EQUIPMENT_PROFILE_IDS, type EquipmentProfileId } from "./equipment-profiles.js";
import { LEVELS, initialAnswers, updatePendingPlan } from "./pending-plan.js";
import { StepHeader } from "./StepHeader.js";
import "./uf-01.css";

const t = en.uf01;

export function LevelScreen() {
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
    <div data-screen-id="UF-01.3" className="wl-uf01">
      <StepHeader step={2} backTo="/welcome/goal" />
      <h1 className="wl-uf01__title wl-uf01__title--step">{t.level.heading}</h1>
      <form className="wl-uf01__form" onSubmit={onSubmit}>
        <div className="wl-uf01__group">
          <p id="wl-uf01-level-legend" className="wl-uf01__tag">
            {t.level.levelLegend}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="wl-uf01-level-legend"
            aria-describedby="wl-uf01-level-hint"
            className="wl-uf01__segments"
          >
            {LEVELS.map((id) => (
              <label key={id} className="wl-uf01__segment">
                <input
                  type="radio"
                  name="level"
                  value={id}
                  checked={level === id}
                  onChange={() => chooseLevel(id)}
                  className="wl-uf01__radio"
                />
                <span className="wl-uf01__segment-label">{t.level.levels[id].label}</span>
              </label>
            ))}
          </div>
          <p id="wl-uf01-level-hint" className="wl-uf01__muted">
            {t.level.levels[level].hint}
          </p>
        </div>
        <div className="wl-uf01__group">
          <p id="wl-uf01-equipment-legend" className="wl-uf01__tag">
            {t.level.equipmentLegend}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="wl-uf01-equipment-legend"
            aria-describedby="wl-uf01-equipment-hint"
            className="wl-uf01__chips"
          >
            {EQUIPMENT_PROFILE_IDS.map((id) => (
              <label key={id} className="wl-uf01__chip">
                <input
                  type="radio"
                  name="equipment"
                  value={id}
                  checked={equipment === id}
                  onChange={() => chooseEquipment(id)}
                  className="wl-uf01__radio"
                />
                <span className="wl-uf01__chip-label">{t.level.equipment[id]}</span>
              </label>
            ))}
          </div>
          <p id="wl-uf01-equipment-hint" className="wl-uf01__muted">
            {t.level.equipmentHint}
          </p>
        </div>
        <button type="submit" className="wl-uf01__primary">
          {t.continue}
        </button>
      </form>
    </div>
  );
}
