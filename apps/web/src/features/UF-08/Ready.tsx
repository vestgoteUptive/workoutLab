// UF-08.4 placeholder (the D-0107 §2 pattern). T-0303d replaces the body; it keeps the wrapper's
// `data-screen-id="UF-08.4"` and the `workout` prop, which is the host's current UF-08.2 `Workout`.
import type { Workout } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";

export interface ReadyProps {
  workout: Workout;
}

export function Ready({ workout }: ReadyProps) {
  return (
    <section data-screen-id="UF-08.4" className="wl-uf08" data-items={workout.plan.items.length}>
      <h1 className="wl-uf08__title">{en.uf08.readyTitle}</h1>
    </section>
  );
}
