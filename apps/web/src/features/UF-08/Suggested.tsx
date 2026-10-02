// UF-08.2 placeholder (D-0107 §2). T-0303b replaces the body; it keeps the wrapper's
// `data-screen-id="UF-08.2"` and the `workout` prop, which is the host's current `Workout`.
import { Link } from "react-router";
import type { Workout } from "@workoutlab/engine";
import { en } from "../../lib/i18n/en.js";

export interface SuggestedProps {
  workout: Workout;
}

export function Suggested({ workout }: SuggestedProps) {
  return (
    <section
      data-screen-id="UF-08.2"
      className="wl-uf08"
      data-items={workout.plan.items.length}
    >
      <Link className="wl-uf08__back" to="/session/setup?step=time">
        {en.uf08.back}
      </Link>
      <h1 className="wl-uf08__title">{en.uf08.suggestedTitle}</h1>
    </section>
  );
}
