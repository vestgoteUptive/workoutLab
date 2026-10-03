// The one place UF-11 evaluates rule 9 (D-0071 §8, T-0308b). Module-private to the feature: it is
// not exported from `index.tsx`. UF-11.2 reads only `nextCheckinDate` and whether `periods` is
// empty; T-0308c's card reads the whole result, through this same function, so the two screens
// can never disagree about the evaluation.
import { checkinSessions, evaluateCheckin } from "@workoutlab/engine";
import type {
  CheckinEvaluation,
  EngineProfile,
  HistorySet,
  LibraryExercise,
  PlanCheckin,
} from "@workoutlab/shared";

export interface CheckinSessionRow {
  id: string;
  startedAt: string;
}

export function evaluatePlanCheckin(
  sessions: readonly CheckinSessionRow[],
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
  profile: EngineProfile,
  checkins: readonly PlanCheckin[],
  now: Date,
  tz: string,
): CheckinEvaluation {
  return evaluateCheckin(
    checkinSessions(
      sessions.map(({ id, startedAt }) => ({ id, startedAt })),
      history,
      library,
    ),
    profile,
    checkins,
    now.toISOString(),
    tz,
  );
}
