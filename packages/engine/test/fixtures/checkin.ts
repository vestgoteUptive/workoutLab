// T-0202 rule 9 fixtures: F-checkin, the P0…P6 periods, "Pk = n" sessions, "On DATE" and the
// T(r) preview-target tables, exactly as the ticket's §Acceptance criteria defines them.
import {
  addDays,
  type Area,
  type CheckinAnswer,
  type CheckinEvaluation,
  type CheckinPeriod,
  type CheckinProfile,
  type CheckinProposal,
  type CheckinSession,
  type CheckinStatus,
  type HistorySet,
  type PreviewTarget,
} from "../../src/index.js";

export const CHECKIN_TZ = "Europe/Stockholm";
export const ONBOARD_DATE = "2026-08-02";

/** F-checkin profile: rhythm 3–4, no priorities, onboarded and plan changed 2026-08-02 10:00. */
export const F_CHECKIN: CheckinProfile = {
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T10:00:00+02:00",
  planUpdatedAt: "2026-08-02T10:00:00+02:00",
};

export function checkinProfile(overrides: Partial<CheckinProfile> = {}): CheckinProfile {
  return { ...F_CHECKIN, ...overrides };
}

export const NO_CHECKINS: CheckinAnswer[] = [];

/** Stockholm offset: CEST (+02:00) before 2026-10-25, CET (+01:00) from then on. */
export function offsetFor(date: string): string {
  return date < "2026-10-25" ? "+02:00" : "+01:00";
}

/** "On DATE": `DATE` at 12:00 local. */
export function on(date: string): string {
  return `${date}T12:00:00${offsetFor(date)}`;
}

/** First local day of period `i` (F-checkin: onboarded 2026-08-02). */
export function periodStart(i: number, onboardDate = ONBOARD_DATE): string {
  return addDays(onboardDate, 14 * i);
}

/** "period (i, n, s)" = `{index, start, end, completed, status}`. */
export function per(
  index: number,
  completed: number,
  status: CheckinStatus,
  onboardDate = ONBOARD_DATE,
): CheckinPeriod {
  const start = periodStart(index, onboardDate);
  return { index, start, end: addDays(start, 13), completed, status };
}

/**
 * "Pk = n": n sessions with `hardSetCount` 3, one per local day from the period's first day at
 * 10:00 local. Past the 14th they wrap to 18:00 on the same days.
 */
export function periodSessions(
  k: number,
  n: number,
  hardSetCount = 3,
  onboardDate = ONBOARD_DATE,
): CheckinSession[] {
  const out: CheckinSession[] = [];
  for (let j = 0; j < n; j++) {
    const date = addDays(periodStart(k, onboardDate), j % 14);
    const time = j < 14 ? "10:00" : "18:00";
    out.push({
      id: `P${k}-${j}${hardSetCount === 3 ? "" : `-h${hardSetCount}`}`,
      startedAt: `${date}T${time}:00${offsetFor(date)}`,
      hardSetCount,
    });
  }
  return out;
}

/** Sessions for a `{k: n}` spec. P0 = P1 = 7 (on plan) unless the spec overrides them. */
export function sessionsFor(spec: Record<number, number>): CheckinSession[] {
  const full: Record<number, number> = { 0: 7, 1: 7, ...spec };
  return Object.keys(full)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((k) => periodSessions(k, full[k] ?? 0));
}

const ORDER: Area[] = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];

function table(values: number[]): PreviewTarget[] {
  return ORDER.map((area, i) => ({ area, setsPer14d: values[i] ?? Number.NaN }));
}

/** T(r) from the ticket's table, written out by hand (not computed by the engine). */
export const T = {
  "2-3": table([14, 14, 11, 9, 9, 14, 14, 11, 9]),
  "4-5": table([26, 26, 21, 15, 15, 26, 26, 21, 15]),
  "7-7": table([30, 30, 24, 18, 18, 30, 30, 24, 18]),
  "1-1": table([10, 10, 8, 6, 6, 10, 10, 8, 6]),
} as const;

export const DOWN_2_3: CheckinProposal = {
  direction: "down",
  rhythmMin: 2,
  rhythmMax: 3,
  previewTargets: T["2-3"],
};

/** AC1's sessions: P0 = P1 = 7, P2 = 4, P3 = 3. */
export const AC1_SESSIONS: CheckinSession[] = sessionsFor({ 2: 4, 3: 3 });

/** AC1's expected result on 2026-09-27. */
export const AC1_RESULT: CheckinEvaluation = {
  periods: [per(2, 4, "under"), per(3, 3, "under")],
  proposal: DOWN_2_3,
  nextCheckinDate: "2026-10-11",
};

/**
 * AC24 setup: one `{id, startedAt}` per distinct `sessionId`, in first-appearance order, where
 * `startedAt` is the earliest `completedAt` among its rows, tombstones included (D-0041 §3).
 */
export function sessionRefsOf(
  history: readonly HistorySet[],
): Array<{ id: string; startedAt: string }> {
  const earliest = new Map<string, string>();
  for (const row of history) {
    const cur = earliest.get(row.sessionId);
    if (cur === undefined || Date.parse(row.completedAt) < Date.parse(cur)) {
      earliest.set(row.sessionId, row.completedAt);
    }
  }
  return [...earliest].map(([id, startedAt]) => ({ id, startedAt }));
}
