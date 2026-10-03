// T-0308b Fixture F and the AC-B4 check-in rows, after docs/specs/uf-11-plan-checkin.md.
// tz Europe/Stockholm, now 2026-09-27T12:00:00+02:00 (= 10:00:00Z, which is the instant AC-B11
// expects in the `answered_at` payload).
import { AREAS, type AreaTarget, type EngineProfile, type PlanCheckin } from "@workoutlab/shared";

export const TZ = "Europe/Stockholm";
export const NOW_ISO = "2026-09-27T10:00:00.000Z";
export const NOW = new Date(NOW_ISO);

/** Fixture F's profile. */
export function profileF(overrides: Partial<EngineProfile> = {}): EngineProfile {
  return {
    goal: "build_muscle",
    level: "intermediate",
    equipment: [],
    rhythmMin: 3,
    rhythmMax: 4,
    priorityAreas: [],
    onboardedAt: "2026-08-02T08:00:00Z",
    planUpdatedAt: "2026-08-02T08:00:00Z",
    ...overrides,
  };
}

/** Fixture F's 9 targets: 20/20/16/12/12/20/20/16/12, all `default`. */
export const F_SETS = [20, 20, 16, 12, 12, 20, 20, 16, 12] as const;

export function targetsF(
  overrides: Partial<Record<string, Partial<AreaTarget>>> = {},
): AreaTarget[] {
  return AREAS.map((area, i) => ({
    area,
    setsPer14d: F_SETS[i]!,
    source: "default" as const,
    updatedAt: "2026-08-02T08:00:00Z",
    ...overrides[area],
  }));
}

/** A `plan_checkins` row with the boring fields filled in. */
export function checkin(
  id: string,
  proposedAt: string,
  completedLast: number,
  before: [number, number],
  proposed: [number, number],
  answer: PlanCheckin["answer"],
  answeredAt: string | null = answer ? proposedAt : null,
): PlanCheckin {
  return {
    id,
    periodIndex: 1,
    completedPrev: 0,
    completedLast,
    rhythmMinBefore: before[0],
    rhythmMaxBefore: before[1],
    proposedMin: proposed[0],
    proposedMax: proposed[1],
    proposedAt,
    answer,
    answeredAt,
  };
}

// AC-B4's four rows. They go into the cache in the order K2, K4, K1, K3, so a UI that trusted
// insertion order would list the wrong three.
export const K1 = checkin("K1", "2026-08-16T08:00:00Z", 3, [4, 5], [3, 4], "accepted");
export const K2 = checkin("K2", "2026-08-30T08:00:00Z", 2, [3, 4], [2, 3], "withdrawn");
export const K3 = checkin("K3", "2026-09-13T08:00:00Z", 10, [3, 4], [4, 5], "kept");
export const K4 = checkin("K4", "2026-09-27T09:00:00Z", 1, [3, 4], [2, 3], null);

/** The "just edited, but has history" row of AC-B3. */
export const KEPT_13_SEP = checkin(
  "KH",
  "2026-09-13T08:00:00Z",
  4,
  [3, 4],
  [4, 5],
  "kept",
  "2026-09-13T08:00:00Z",
);
