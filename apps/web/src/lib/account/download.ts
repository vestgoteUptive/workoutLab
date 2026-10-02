// The export file (D-0136 §2, UF-11.4): `workoutlab-export-{YYYY-MM-DD}.json`, named from the
// **local** date in the device tz, `application/json`, pretty-printed with 2 spaces.
import type { AccountExport } from "./export.js";

/** `workoutlab-export-YYYY-MM-DD.json`, the calendar date of `now` in `tz`. */
export function exportFileName(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `workoutlab-export-${get("year")}-${get("month")}-${get("day")}.json`;
}

/** Offers the export as a file: one Blob, one `<a download>` click, then the URL is revoked. */
export function downloadAccountExport(
  data: AccountExport,
  now: Date,
  tz: string,
  doc: Document = document,
): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = exportFileName(now, tz);
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    URL.revokeObjectURL(url);
  }
}
