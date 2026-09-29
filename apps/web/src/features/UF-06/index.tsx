// UF-06 Progress stub (T-0300a). The feature ticket builds the designed screen.
import { useParams } from "react-router";
import { en } from "../../lib/i18n/en.js";

export function Progress() {
  return (
    <div data-screen-id="UF-06.1">
      <h1>{en.screens.progress}</h1>
    </div>
  );
}

// UF-06.2 Exercise history stub (T-0318). T-0307b builds the screen.
export function ExerciseHistory() {
  const { exerciseId } = useParams();
  return (
    <div data-screen-id="UF-06.2">
      <h1>{en.screens.exerciseHistory}</h1>
      <p>{exerciseId}</p>
    </div>
  );
}
