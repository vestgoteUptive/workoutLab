// The D-0005 attribution block (D-0069 §2, D-0079 §5), shared by UF-04.2.
import type { ExerciseDetail } from "../../lib/offline/db.js";
import { en } from "../../lib/i18n/en.js";

const LICENSE_LINKS: Record<string, string> = en.uf04.licenseLinks;

export function Attribution({ detail }: { detail: ExerciseDetail }) {
  if (detail.source === "workoutlab") {
    return (
      <p data-field="attribution" className="wl-uf04__attribution">
        {en.uf04.attributionPrefix}
        {en.uf04.attributionWorkoutlab}
      </p>
    );
  }
  const licenseHref = LICENSE_LINKS[detail.license];
  const parts: React.ReactNode[] = [];
  if (detail.attribution !== null) parts.push(detail.attribution);
  parts.push(
    licenseHref === undefined ? (
      detail.license
    ) : (
      <a key="license" href={licenseHref} target="_blank" rel="noopener noreferrer">
        {detail.license}
      </a>
    ),
  );
  if (detail.sourceUrl !== null) {
    parts.push(
      <a key="source" href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">
        {en.uf04.attributionSource}
      </a>,
    );
  }
  return (
    <p data-field="attribution" className="wl-uf04__attribution">
      {en.uf04.attributionPrefix}
      {parts.map((part, index) => (
        <span key={index}>
          {index === 0 ? null : en.uf04.dot}
          {part}
        </span>
      ))}
    </p>
  );
}
