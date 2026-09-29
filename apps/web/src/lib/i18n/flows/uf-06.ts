// UF-06 strings (D-0071 §1). Owned by the UF-06 feature ticket: it is the only ticket that
// edits this file, so the Phase 3 feature lanes never collide in `en.ts`.
export const uf06 = {
  /** Accessible name of the Balance card, which is one link to UF-10.1 (AC-4). */
  balanceLink: "Balance, last 14 days",
  balanceCaption: "Last 14 days",
  calendarName: "Workouts this month",
  workoutDay: "Workout",
  today: "Today",
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
} as const;
