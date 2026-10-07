// Neutral excluded-areas notice (T-0537, D-0199 §8). Standing, not a live region.
import { en } from "../../lib/i18n/en.js";
import "./excluded-areas-notice.css";

export type ExcludedArea = keyof typeof en.bodyMap.areas;

export interface ExcludedAreasNoticeProps {
  /** In the caller's order (the engine's fixed order). */
  areas: readonly ExcludedArea[];
}

export function ExcludedAreasNotice({ areas }: ExcludedAreasNoticeProps) {
  if (areas.length === 0) return null;
  const names = areas.map((a) => en.bodyMap.areas[a]).join(", ");
  return (
    <p className="wl-excluded-notice">
      <svg
        className="wl-excluded-notice__icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
      <span>
        {areas.length === 1 ? en.excluded.noticeOne(names) : en.excluded.noticeMany(names)}
      </span>
    </p>
  );
}
