// T-0469 UF-11.4 Account settings e2e fixture (D-0172 §6). Kept out of
// `fixtures/supabase-mock.ts` (shared, this ticket may not edit it) and out of the spec file only
// because the export rows need their own routes, registered in a precise order (see the spec).
//
// `ACCOUNT_PROFILE`/`ACCOUNT_TARGETS` feed `mockSupabaseData`, which this spec needs for the
// shell's own `profiles`/`area_targets` reads (and because `mockSupabaseData` also answers every
// `sessions*`/`session_sets*`/`session_sets_live*` read with `[]`, before the spec's own
// exact-path routes for `sessions`/`session_sets` are registered on top).
import type { OfflineFixtures } from "./supabase-mock.js";

const AREAS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

export const ACCOUNT_PROFILE = {
  goal: "build_muscle",
  level: "intermediate",
  equipment: [],
  rhythm_min: 3,
  rhythm_max: 4,
  priority_areas: [],
  onboarded_at: "2026-08-02T08:00:00.000Z",
  plan_changed_at: "2026-08-02T08:00:00.000Z",
};

export const ACCOUNT_TARGETS = AREAS.map((area) => ({
  area_id: area,
  sets_per_14d: 12,
  source: "default",
  updated_at: "2026-08-02T08:00:00.000Z",
}));

/** `mockSupabaseData` needs these keys even though UF-11.4 itself reads none of them: it is the
 *  shared helper every signed-in e2e spec uses (D-0086), and the shell's own AutoSync fires on
 *  every signed-in route. */
export const ACCOUNT_FIXTURES: OfflineFixtures = {
  sets: [],
  exercises: [],
  exerciseAreas: [],
  areaTargets: ACCOUNT_TARGETS,
  profile: ACCOUNT_PROFILE,
};

export const EXPORT_SESSIONS = [
  { id: "sess-1", started_at: "2026-09-20T09:00:00.000Z", ended_at: "2026-09-20T09:40:00.000Z" },
  { id: "sess-2", started_at: "2026-09-22T09:00:00.000Z", ended_at: "2026-09-22T09:35:00.000Z" },
];

export const EXPORT_SETS = [
  { id: "set-1", session_id: "sess-1", exercise_id: "squat", completed_at: "2026-09-20T09:05:00Z" },
  { id: "set-2", session_id: "sess-1", exercise_id: "squat", completed_at: "2026-09-20T09:10:00Z" },
  { id: "set-3", session_id: "sess-2", exercise_id: "bench", completed_at: "2026-09-22T09:05:00Z" },
];
