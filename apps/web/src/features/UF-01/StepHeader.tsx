// The UF-01.2–UF-01.4 header: Back, the three-segment progress and "n/3" (prototype).
import { Link } from "react-router";
import { en } from "../../lib/i18n/en.js";

const TOTAL = 3;

export function StepHeader({ step, backTo }: { step: 1 | 2 | 3; backTo: string }) {
  return (
    <div className="wl-uf01__header">
      <Link to={backTo} className="wl-uf01__back" aria-label={en.uf01.back}>
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
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <div className="wl-uf01__bars" aria-hidden="true">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className="wl-uf01__bar" data-done={i < step ? "true" : "false"} />
        ))}
      </div>
      <p className="wl-uf01__progress">
        <span className="wl-uf01__sr">{en.uf01.progressName(String(step), String(TOTAL))}</span>
        <span data-field="progress" aria-hidden="true">
          {String(step)}/{String(TOTAL)}
        </span>
      </p>
    </div>
  );
}
