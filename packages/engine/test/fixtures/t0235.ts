// T-0235 (D-0137, rule 14, UF-09.3): the light-lift re-entry and deload histories.
// All at F-tz (Europe/Stockholm, now 2026-09-27T12:00:00+02:00).
import type { HistorySet } from "../../src/index.js";
import { setsWithReps } from "./common.js";

/** `lightReentry`: bench-press 2 × 6, 6, 6 on 2026-09-01 at 10:00 (gap 26 → step 2). */
export const lightReentry: HistorySet[] = setsWithReps(
  "2026-09-01",
  "bench-press",
  [
    [2, 6],
    [2, 6],
    [2, 6],
  ],
  { tag: "lightReentry:" },
);

/**
 * `lightDeload`: bench-press 2 × 5, 5, 4 on 2026-09-20 and 2 × 5, 4, 4 on 2026-09-24, each at
 * 10:00 (step 5). Distinct sessionIds (`s@<instant>`) and clientIds (tag + instant + index).
 */
export const lightDeload: HistorySet[] = [
  ...setsWithReps(
    "2026-09-20",
    "bench-press",
    [
      [2, 5],
      [2, 5],
      [2, 4],
    ],
    { tag: "lightDeload:" },
  ),
  ...setsWithReps(
    "2026-09-24",
    "bench-press",
    [
      [2, 5],
      [2, 4],
      [2, 4],
    ],
    { tag: "lightDeload:" },
  ),
];
