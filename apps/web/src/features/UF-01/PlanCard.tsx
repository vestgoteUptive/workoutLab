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
    <section className="wl-uf01__plan" aria-labelledby="wl-uf01-plan-title" data-field="plan">
      <p className="wl-uf01__tag wl-uf01__tag--accent">{t.schedule.planTag}</p>
      <h2 id="wl-uf01-plan-title" className="wl-uf01__plan-title">
        {t.goal.options[goal].label}
      </h2>
      <p className="wl-uf01__muted">
        {t.schedule.planSub(t.level.levels[level].label, t.level.equipment[equipmentProfile])}
      </p>
      <p className="wl-uf01__rhythm" data-field="rhythm">
        {t.schedule.rhythmLine(rhythmMin, rhythmMax)}
      </p>
      <h3 id="wl-uf01-targets-heading" className="wl-uf01__tag">
        {t.schedule.targetsHeading}
      </h3>
      <ul className="wl-uf01__targets" aria-labelledby="wl-uf01-targets-heading">
        {AREAS.map((area) => (
          <li key={area} className="wl-uf01__target" data-area={area}>
            <span className="wl-uf01__target-name">{en.bodyMap.areas[area]}</span>{" "}
            <span className="wl-uf01__target-sets" data-field="sets">
              {String(targets[area])}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
