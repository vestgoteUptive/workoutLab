// The UF-01.4 plan card (D-0064 §5): goal, level and equipment labels, the rhythm line and the
// 9 per-area targets in the fixed `AREAS` order. It does no target arithmetic: `targets` is the
// `deriveTargets` result, passed in by `ScheduleScreen.tsx` (the one UF-01 module that imports
// the engine, principle 3), and each row renders `targets[area]` as it is.
import type { Area, Goal, Level } from "@workoutlab/shared";
import { AREAS } from "@workoutlab/shared";
import { en } from "../../lib/i18n/en.js";
import type { EquipmentProfileId } from "./equipment-profiles.js";

const t = en.uf01;

export interface PlanCardProps {
  goal: Goal;
  level: Level;
  equipmentProfile: EquipmentProfileId;
  rhythmMin: number;
  rhythmMax: number;
  targets: Readonly<Record<Area, number>>;
}

export function PlanCard({
  goal,
  level,
  equipmentProfile,
  rhythmMin,
  rhythmMax,
  targets,
}: PlanCardProps) {
  return (
    <section className="wl-uf01-plan__plan" aria-labelledby="wl-uf01-plan-title" data-field="plan">
      <p className="wl-type-label">{t.schedule.planTag}</p>
      <h2 id="wl-uf01-plan-title" className="wl-type-section">
        {t.goal.options[goal].label}
      </h2>
      <p className="wl-type-label">
        {t.schedule.planSub(t.level.levels[level].label, t.level.equipment[equipmentProfile])}
      </p>
      <p className="wl-type-body wl-uf01-plan__rhythm" data-field="rhythm">
        {t.schedule.rhythmLine(rhythmMin, rhythmMax)}
      </p>
      <h3 id="wl-uf01-targets-heading" className="wl-type-label">
        {t.schedule.targetsHeading}
      </h3>
      <ul className="wl-uf01-plan__targets" aria-labelledby="wl-uf01-targets-heading">
        {AREAS.map((area) => (
          <li key={area} className="wl-row" data-area={area}>
            <span className="wl-type-body">{en.bodyMap.areas[area]}</span>{" "}
            <span className="wl-type-body wl-uf01-plan__sets" data-field="sets">
              {String(targets[area])}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
