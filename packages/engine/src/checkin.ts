// Rule 9: adaptive targets / plan check-in (UF-11.1, UF-11.2; D-0018, D-0027, D-0041, D-0061 §2,
// D-0094). One ended 14-day period that is under or over is enough to propose.
// Stateless and pure: the same inputs give the same proposal every time, on the device,
// offline (D-0037 §2). The engine never changes targets; only an Accept (UI → data) does.
import { indexLibrary, isHardSet, normalizeHistory } from "./history.js";
import { assertRhythmRange, previewTargets } from "./targets.js";
import { addDays, dayDiff, localDate } from "./time.js";
import type {
  CheckinAnswer,
  CheckinEvaluation,
  CheckinPeriod,
  CheckinProfile,
  CheckinProposal,
  CheckinSession,
  CheckinSessionRef,
  CheckinStatus,
  HistorySet,
  Instant,
  LibraryExercise,
  LocalDate,
  TimeZone,
} from "./types.js";

/** Local days per check-in period (rule 9). */
export const PERIOD_DAYS = 14;
/** Under: `completed < 0.7 × 2·rhythmMin`, as `10·completed < 14·rhythmMin` (D-0041 §5). */
export const UNDER_FACTOR_X10 = 14;
/** Over: `completed > 1.1 × 2·rhythmMax`, as `10·completed > 22·rhythmMax` (D-0041 §5). */
export const OVER_FACTOR_X10 = 22;
/** Proposed rhythms are clamped to 1–7 sessions per week (rule 9). */
export const RHYTHM_FLOOR = 1;
export const RHYTHM_CEILING = 7;
/** At most this many periods are listed and compared: the last ended one (D-0061 §2, D-0094 §1). */
export const COMPARED_PERIODS = 1;

/** Rule 9 status of one period, in exact integer arithmetic (D-0041 §5). */
export function periodStatus(
  completed: number,
  rhythmMin: number,
  rhythmMax: number,
): CheckinStatus {
  if (10 * completed < UNDER_FACTOR_X10 * rhythmMin) return "under";
  if (10 * completed > OVER_FACTOR_X10 * rhythmMax) return "over";
  return "on_plan";
}

function clampRhythm(v: number): number {
  return Math.min(RHYTHM_CEILING, Math.max(RHYTHM_FLOOR, v));
}

function assertHardSetCount(s: CheckinSession): void {
  if (!Number.isInteger(s.hardSetCount) || s.hardSetCount < 0) {
    throw new RangeError(`hardSetCount must be an integer ≥ 0, got ${s.hardSetCount} (${s.id})`);
  }
}

/** The latest non-null `answeredAt` as a local date, whatever the array order (D-0041 §2). */
function lastAnsweredDate(checkins: readonly CheckinAnswer[], tz: TimeZone): LocalDate | null {
  let latest: LocalDate | null = null;
  for (const c of checkins) {
    if (c.answeredAt === null) continue;
    const d = localDate(c.answeredAt, tz);
    if (latest === null || d > latest) latest = d;
  }
  return latest;
}

/**
 * Rule 9. `periods` holds at most one entry: the last ended period (index `currentIndex − 1`)
 * if its end ≥ `resetDate`, otherwise none (D-0094 §1). Eligibility only grows with the end
 * date, so there is no earlier period to fall back to. If that period is `under` or `over`,
 * the proposal moves the rhythm by ±1, clamped to 1–7, and is null when the clamp leaves the
 * rhythm unchanged (D-0061 §2, D-0094 §2). The result doesn't depend on the order of
 * `sessions` or `checkins` (D-0041 §2).
 */
export function evaluateCheckin(
  sessions: readonly CheckinSession[],
  profile: CheckinProfile,
  checkins: readonly CheckinAnswer[],
  now: Instant,
  tz: TimeZone,
): CheckinEvaluation {
  const { rhythmMin, rhythmMax } = profile;
  assertRhythmRange(rhythmMin, rhythmMax);
  const today = localDate(now, tz);
  const onboardDate = localDate(profile.onboardedAt, tz);
  const planDate = localDate(profile.planUpdatedAt, tz);
  const answered = lastAnsweredDate(checkins, tz);

  // Validate every session up front, so bad input throws whatever the date (D-0041 §6).
  const completedDates: LocalDate[] = [];
  for (const s of sessions) {
    assertHardSetCount(s);
    const d = localDate(s.startedAt, tz);
    if (s.hardSetCount >= 1) completedDates.push(d);
  }

  if (today < onboardDate) {
    return { periods: [], proposal: null, nextCheckinDate: addDays(onboardDate, PERIOD_DAYS) };
  }

  const currentIndex = Math.floor(dayDiff(onboardDate, today) / PERIOD_DAYS);
  const resetDate = answered !== null && answered > planDate ? answered : planDate;

  const periods: CheckinPeriod[] = [];
  for (let k = Math.max(0, currentIndex - COMPARED_PERIODS); k < currentIndex; k++) {
    const start = addDays(onboardDate, PERIOD_DAYS * k);
    const end = addDays(start, PERIOD_DAYS - 1);
    if (end < resetDate) continue; // not eligible (rule 9 Reset)
    let completed = 0;
    for (const d of completedDates) if (d >= start && d <= end) completed++;
    periods.push({
      index: k,
      start,
      end,
      completed,
      status: periodStatus(completed, rhythmMin, rhythmMax),
    });
  }

  return {
    periods,
    proposal: proposalFor(periods, profile),
    nextCheckinDate: addDays(onboardDate, PERIOD_DAYS * (currentIndex + 1)),
  };
}

/** D-0094 §2: the one listed period decides; none listed, or on plan, means no proposal. */
function proposalFor(periods: CheckinPeriod[], profile: CheckinProfile): CheckinProposal | null {
  const last = periods[periods.length - 1];
  if (last === undefined || last.status === "on_plan") return null;
  const direction = last.status === "under" ? "down" : "up";
  const delta = direction === "down" ? -1 : 1;
  const newMax = clampRhythm(profile.rhythmMax + delta);
  const newMin = Math.min(clampRhythm(profile.rhythmMin + delta), newMax);
  if (newMin === profile.rhythmMin && newMax === profile.rhythmMax) return null;
  return {
    direction,
    rhythmMin: newMin,
    rhythmMax: newMax,
    previewTargets: previewTargets({
      rhythmMin: newMin,
      rhythmMax: newMax,
      priorityAreas: profile.priorityAreas,
    }),
  };
}

/**
 * D-0041 §3: builds rule 9's `CheckinSession[]` from session rows and history (server rows ∪
 * the offline queue). History is normalised (rule 0), then each session's sets are counted
 * with `isHardSet` (rule 2, D-0034 §4). Output keeps the input order; sets of sessions not in
 * `sessions` are ignored.
 */
export function checkinSessions(
  sessions: readonly CheckinSessionRef[],
  history: readonly HistorySet[],
  library: readonly LibraryExercise[],
): CheckinSession[] {
  const byId = indexLibrary(library);
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.id, 0);
  for (const set of normalizeHistory(history)) {
    const current = counts.get(set.sessionId);
    if (current === undefined) continue;
    if (isHardSet(set, byId.get(set.exerciseId))) counts.set(set.sessionId, current + 1);
  }
  return sessions.map((s) => ({
    id: s.id,
    startedAt: s.startedAt,
    hardSetCount: counts.get(s.id) ?? 0,
  }));
}
