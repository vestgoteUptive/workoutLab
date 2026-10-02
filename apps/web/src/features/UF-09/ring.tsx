// The UF-09.2 / UF-09.7 progress ring (T-0304c). Display only: the fraction comes from the
// machine's wall-clock timer (NFR-TIME-1), and the label (the `role="timer"` text) is the caller's.
import type { ReactNode } from "react";

/** The ring's radius in its 100 × 100 view box. */
const RING_R = 45;
const RING_C = 2 * Math.PI * RING_R;
const RING_CENTRE = 50;

export function Ring({
  fraction,
  warn,
  children,
}: {
  /** 1 = full, 0 = empty. */
  fraction: number;
  warn: boolean;
  children: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div className="wl-uf09__ring" data-field="ring" data-warn={warn ? "true" : "false"}>
      <svg className="wl-uf09__ring-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="wl-uf09__ring-track" cx={RING_CENTRE} cy={RING_CENTRE} r={RING_R} />
        <circle
          className="wl-uf09__ring-fill"
          cx={RING_CENTRE}
          cy={RING_CENTRE}
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - clamped)}
        />
      </svg>
      <div className="wl-uf09__ring-label">{children}</div>
    </div>
  );
}
