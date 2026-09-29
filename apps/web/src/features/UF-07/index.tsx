// UF-07 Routine builder stub (T-0318, the T-0300a stub precedent). `RoutineEditor` backs both
// `/plan/routines/new` and `/plan/routines/:routineId` (UF-07.1, D-0071 §2); T-0308a builds it.
import { en } from "../../lib/i18n/en.js";

export function RoutineEditor() {
  return (
    <div data-screen-id="UF-07.1">
      <h1>{en.screens.routineEditor}</h1>
    </div>
  );
}
