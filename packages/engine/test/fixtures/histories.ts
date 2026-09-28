// Simulated 14-day histories (engine-rules §Required tests, D-0034 §9). T-0200 runs them
// through balance(); T-0201/T-0202 reuse them for suggest() and evaluateCheckin().
// All at F-tz (Europe/Stockholm, now 2026-09-27T12:00:00+02:00, window 09-14…09-27).
import type { HistorySet } from "../../src/index.js";
import { setsOn } from "./common.js";

/** The AC29 session template: 19 sets across all 9 areas. */
export function balancedSession(date: string, time = "10:00"): HistorySet[] {
  const o = { time };
  return [
    ...setsOn(3, "bench-press", date, o),
    ...setsOn(3, "barbell-row", date, o),
    ...setsOn(3, "back-squat", date, o),
    ...setsOn(2, "overhead-press", date, o),
    ...setsOn(2, "romanian-deadlift", date, o),
    ...setsOn(2, "calf-raise", date, o),
    ...setsOn(2, "biceps-curl", date, o),
    ...setsOn(2, "dead-bug", date, o),
  ];
}

/** AC29 balanced: 7 sessions every other day, 09-15 … 09-27 at 10:00. */
export const balancedHistory: HistorySet[] = [
  "2026-09-15",
  "2026-09-17",
  "2026-09-19",
  "2026-09-21",
  "2026-09-23",
  "2026-09-25",
  "2026-09-27",
].flatMap((d) => balancedSession(d));

/** One AC30 session: bench-press 4, db-bench-press 3, push-up 3 at 18:00. */
export function chestSession(date: string): HistorySet[] {
  const o = { time: "18:00" };
  return [
    ...setsOn(4, "bench-press", date, o),
    ...setsOn(3, "db-bench-press", date, o),
    ...setsOn(3, "push-up", date, o),
  ];
}

/** AC30 all chest, no legs: 6 sessions, 09-16 … 09-26 at 18:00. */
export const allChestNoLegsHistory: HistorySet[] = [
  "2026-09-16",
  "2026-09-18",
  "2026-09-20",
  "2026-09-22",
  "2026-09-24",
  "2026-09-26",
].flatMap(chestSession);

/** AC31 returning after 10 days off: 4 full sessions before the window, then a light return. */
export const returningAfter10DaysHistory: HistorySet[] = [
  ...["2026-09-03", "2026-09-06", "2026-09-09", "2026-09-12"].flatMap((d) => balancedSession(d)),
  ...setsOn(3, "back-squat", "2026-09-15"),
  ...setsOn(4, "romanian-deadlift", "2026-09-17"),
];

function pick(history: HistorySet[], exerciseId: string, date: string): HistorySet {
  const row = history.find((r) => r.exerciseId === exerciseId && r.completedAt.startsWith(date));
  if (!row) throw new Error(`fixture: no ${exerciseId} on ${date}`);
  return row;
}

const benchToDelete = pick(allChestNoLegsHistory, "bench-press", "2026-09-26");
const pushUpToReplay = pick(allChestNoLegsHistory, "push-up", "2026-09-26");

/** The AC32 offline queue (`pending: true`), passed after the server rows. */
export const offlineQueue: HistorySet[] = [
  // (a) 3 new romanian-deadlift sets logged offline this morning.
  ...setsOn(3, "romanian-deadlift", "2026-09-27", { time: "09:00", pending: true }),
  // (b) a tombstone (newer edited_at) for one 09-26 bench-press set.
  {
    ...benchToDelete,
    pending: true,
    editedAt: "2026-09-27T08:00:00+02:00",
    deletedAt: "2026-09-27T08:00:00+02:00",
  },
  // (c) an identical replay (same clientId and edited_at) of one 09-26 push-up set.
  { ...pushUpToReplay, pending: true },
];

/** AC32 offline-merged: the AC30 server rows ∪ the queue. */
export const offlineMergedHistory: HistorySet[] = [...allChestNoLegsHistory, ...offlineQueue];

export const SIMULATED_HISTORIES = {
  balanced: balancedHistory,
  allChestNoLegs: allChestNoLegsHistory,
  returningAfter10Days: returningAfter10DaysHistory,
  offlineMerged: offlineMergedHistory,
} as const satisfies Record<string, HistorySet[]>;
