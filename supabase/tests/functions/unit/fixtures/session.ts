// Fixtures for the POST /sessions/{id}/finish handler-core unit tests (T-0203c). Mirrors the
// ticket's fixture session S: startedAt 2026-09-28T07:00:00Z, timeBudgetMin 30, 3 live hard sets
// (2 x barbell-back-squat, 1 x push-up), 1 warm-up set and 1 tombstoned hard set.
// 30 x 60 + 120 = 1920 s (the withinBudget boundary, AC25).
import type { HistorySet } from "@workoutlab/shared";
import type { SessionRow } from "../../../../functions/_shared/repo.ts";

export const SESSION_ID = "0b9c4a52-6f1e-4d7a-9a51-2c3d4e5f6a7b";
export const STARTED_AT = "2026-09-28T07:00:00Z";

export function sessionFixture(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    startedAt: STARTED_AT,
    endedAt: null,
    timeBudgetMin: 30,
    effortRating: null,
    ...overrides,
  };
}

function set(
  clientId: string,
  exerciseId: string,
  options: { isWarmup?: boolean; deletedAt?: string | null } = {},
): HistorySet {
  return {
    clientId,
    sessionId: SESSION_ID,
    exerciseId,
    isWarmup: options.isWarmup ?? false,
    completedAt: STARTED_AT,
    editedAt: STARTED_AT,
    deletedAt: options.deletedAt ?? null,
    reps: 5,
    weightKg: 80,
    durationS: null,
  };
}

/** S's 3 live hard sets (2 x barbell-back-squat, 1 x push-up) + 1 warm-up set. The tombstoned
 * hard set is deliberately *not* included here: `loadSessionSets` already filters
 * `deleted_at is null` at the query level, so the handler core never sees it (mirrors the real
 * data path exactly, rather than re-testing the query filter here). */
export function sessionSetsFixture(): HistorySet[] {
  return [
    set("squat-1", "barbell-back-squat"),
    set("squat-2", "barbell-back-squat"),
    set("push-up-1", "push-up"),
    set("warmup-1", "wu-bodyweight-squat", { isWarmup: true }),
  ];
}

export function emptySessionSetsFixture(): HistorySet[] {
  return [];
}
