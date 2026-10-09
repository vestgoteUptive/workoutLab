// The UF-01.2–UF-01.4 header: Back, the three-segment progress and "n/3" as a label (Cobalt, D-0213).
import { Link } from "react-router";
import { en } from "../../lib/i18n/en.js";

const TOTAL = 3;

export function StepHeader({ step, backTo }: { step: 1 | 2 | 3; backTo: string }) {
  return (
    <div className="wl-uf01-plan__header">
      <Link to={backTo} className="wl-uf01-plan__back" aria-label={en.uf01.back}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
      </Link>
      <div className="wl-uf01-plan__bars" aria-hidden="true">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className="wl-uf01-plan__bar" data-done={i < step ? "true" : "false"} />
        ))}
      </div>
      <p className="wl-type-label wl-uf01-plan__progress">
        <span className="wl-uf01__sr">{en.uf01.progressName(String(step), String(TOTAL))}</span>
        <span data-field="progress" aria-hidden="true">
          {String(step)}/{String(TOTAL)}
        </span>
      </p>
    </div>
  );
}
