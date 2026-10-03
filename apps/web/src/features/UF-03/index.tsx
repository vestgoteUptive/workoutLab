// UF-03 List view / Summary. `Summary` backs the `/session/:sessionId/summary` route (UF-03.3,
// D-0071 §2). It stays a wrapper (D-0142 §4, the UF-04 `Compare` pattern): the screen id and
// the `<h1>` are here, the content is its own module, so the shell tests that render this route
// with no session row see the same surface they always did.
// `ListView` (UF-03.1, T-0416) is the UF-09.9 seam overlay. UF-03.1/.2 are overlays inside `/session/:sessionId` and have no route of their own.
import { en } from "../../lib/i18n/en.js";
export { ListView } from "./ListView.js";
import { SummaryContent, type SummaryProps } from "./SummaryContent.js";

export function Summary(props: SummaryProps = {}) {
  return (
    <div data-screen-id="UF-03.3" className="wl-uf03-summary">
      <h1>{en.screens.sessionSummary}</h1>
      <SummaryContent {...props} />
    </div>
  );
}
