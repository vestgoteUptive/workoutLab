// UF-06 strings (D-0071 §1). Owned by the UF-06 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
export const uf06 = {
  /** Accessible name of the Balance card, which is one link to UF-10.1 (AC-4). */
  balanceLink: "Balance, last 14 days",
  balanceCaption: "Last 14 days",
  calendarName: "Workouts this month",
  workoutDay: "Workout",
  workoutsThisMonth: (n: number) => (n === 1 ? "1 workout this month" : `${n} workouts this month`),
  recentTitle: "Recent exercises",
  noExercises: "No exercises logged yet",
  last8Weeks: "Last 8 weeks",
  bestSet: "Best set",
  heaviest: "Heaviest",
  sessions: "Sessions",
  howTo: "How to",
  noSets: "No sets in the last 8 weeks",
  noValue: "—",
  historyName: "Sessions",
  historyRow: (date: string, sets: string) => `${date} · ${sets}`,
  /** A weight with its unit: "102.5 kg". */
  weightKg: (weight: string) => `${weight} kg`,
  /** A weighted set inside a session row: "102.5 × 5". */
  weightedSet: (weight: string, reps: string) => `${weight} × ${reps}`,
  /** A weighted "Best set" label carries the unit: "102.5 kg × 5" (D-0079 §8). */
  weightedBest: (weight: string, reps: string) => `${weight} kg × ${reps}`,
  repsBest: (reps: string) => `${reps} reps`,
  seconds: (s: string) => `${s} s`,
  /** UF-06.2 estimated 1RM (D-0256, D-0258). Whole kg, always "about". */
  e1rmLabel: "Est. 1RM",
  aboutKg: (kg: string) => `about ${kg} kg`,
  deltaUp: (kg: string, date: string) => `Up ${kg} kg since ${date}`,
  deltaDown: (kg: string, date: string) => `Down ${kg} kg since ${date}`,
  deltaSame: (date: string) => `Same as ${date}`,
  e1rmChartMany: (n: number, first: string, d1: string, last: string, d2: string) =>
    `Estimated one-rep max, ${n} sessions, from ${first} on ${d1} to ${last} on ${d2}.`,
  e1rmChartOne: (value: string, date: string) =>
    `Estimated one-rep max, 1 session, ${value} on ${date}.`,
  e1rmOnePoint: "One session so far. Log it again to see a trend.",
  e1rmNone: "No estimate yet. Estimates need a weighted set of 1\u201310 reps.",
  e1rmWeightedOnly: "Estimated 1RM is for weighted lifts.",
  e1rmExplain:
    "Estimated from your best weighted set of 1\u201310 reps each session. It's a guide, not a tested max.",
  showTable: "Show as table",
  hideTable: "Hide table",
  e1rmTableCaption: "Estimated 1RM per session",
  colDate: "Date",
  colBestSet: "Best set",
  colE1rm: "Est. 1RM",
} as const;
