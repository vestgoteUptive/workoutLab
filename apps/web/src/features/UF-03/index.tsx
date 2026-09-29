// UF-03 List view stub (T-0318, the T-0300a stub precedent). `Summary` backs the
// `/session/:sessionId/summary` route (UF-03.3, D-0071 §2); T-0305b builds the screen.
// UF-03.1/.2 are overlays inside `/session/:sessionId` and have no route of their own.
import { en } from "../../lib/i18n/en.js";

export function Summary() {
  return (
    <div data-screen-id="UF-03.3">
      <h1>{en.screens.sessionSummary}</h1>
    </div>
  );
}
