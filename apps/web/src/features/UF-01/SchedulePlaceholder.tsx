// UF-01.4 placeholder: heading only. T-0301d replaces it with the steppers and the plan card.
import { en } from "../../lib/i18n/en.js";
import "./uf-01.css";

export function SchedulePlaceholder() {
  return (
    <div data-screen-id="UF-01.4" className="wl-uf01">
      <h1 className="wl-uf01__title wl-uf01__title--step">{en.uf01.schedule.heading}</h1>
    </div>
  );
}
