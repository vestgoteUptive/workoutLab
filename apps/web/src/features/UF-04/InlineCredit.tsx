// The link-free in-session credit for third-party text (D-0089 §1, T-0364). Plain text only: no
// `<a>`, no licence URI and no source URL, so a session keeps its single control (principle 1).
// Our own rows (`source: "workoutlab"`) render nothing (D-0089 §2). Exported from this file, not
// from the feature's index.tsx; a public export comes with a later decision.
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { en } from "../../lib/i18n/en.js";

const LICENSE_LABELS: Record<string, string> = en.uf04.licenseLabels;

export function InlineCredit({ detail }: { detail: ExerciseDetail }) {
  if (detail.source === "workoutlab") return null;
  const parts: string[] = [];
  // Content data (D-0005): a blank attribution is absent, and only own keys of the label map
  // count, so a licence named after an Object.prototype member prints as itself (T-0357).
  if (detail.attribution !== null && detail.attribution.trim() !== "") {
    parts.push(detail.attribution);
  }
  parts.push(
    Object.hasOwn(LICENSE_LABELS, detail.license)
      ? LICENSE_LABELS[detail.license]!
      : detail.license,
  );
  return (
    <p data-field="inline-credit" className="wl-uf04-howto__credit">
      {en.uf04.attributionPrefix}
      {parts.join(en.uf04.dot)}
    </p>
  );
}
