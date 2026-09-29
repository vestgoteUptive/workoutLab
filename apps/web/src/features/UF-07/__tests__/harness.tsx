// Shared test harness for UF-07.1 (T-0308a). A feature-local Supabase spy that records every
// `from(table)` call in order with its method, payload, options and filter chain; a seeded
// `lib/offline` cache; and a router with a location probe. Nothing here is imported by product
// code.
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb } from "../../../lib/offline/db.js";
import { freshOfflineDb, signIn } from "../../../lib/offline/__tests__/test-helpers.js";
import { RoutineEditor } from "../index.js";
import { offline, setOnline, spy } from "./spies.js";

export const USER = "33333333-3333-4333-8333-333333333333";
export const R = "22222222-2222-4222-8222-222222222222";
export const R2 = "44444444-4444-4444-8444-444444444444";

function exercise(
  id: string,
  name: string,
  kind: "exercise" | "warmup" = "exercise",
): LibraryExercise {
  return {
    id,
    name,
    kind,
    type: "compound",
    level: "beginner",
    equipment: [],
    areas: {},
    timed: false,
    incrementKg: 2.5,
    defaultDurationS: null,
    externalLoad: true,
  } as LibraryExercise;
}

export const LIBRARY: LibraryExercise[] = [
  exercise("barbell-back-squat", "Barbell back squat"),
  exercise("barbell-front-squat", "Barbell front squat"),
  exercise("goblet-squat-dumbbell", "Goblet squat"),
  exercise("romanian-deadlift-barbell", "Romanian deadlift (barbell)"),
  exercise("leg-curl-machine", "Leg curl (machine)"),
  exercise("bench-press-barbell", "Bench press"),
  exercise("pull-up", "Pull-up"),
  exercise("overhead-press", "Overhead press"),
  exercise("plank", "Plank"),
  exercise("jumping-jacks", "Jumping jacks", "warmup"),
];

export const R_ITEMS = ["barbell-back-squat", "romanian-deadlift-barbell", "leg-curl-machine"];

export async function putRoutine(id: string, name: string, exerciseIds: string[], extra = {}) {
  await offlineDb().routineCache.put({
    key: `${USER}:${id}`,
    userId: USER,
    id,
    name,
    updatedAt: "2026-09-20T10:00:00.000Z",
    items: exerciseIds.map((exerciseId, position) => ({ position, exerciseId, ...extra })),
  });
}

/** A fresh cache with the signed-in user, the library, and routine R (unless `routines` is set). */
export async function seed(opts: { routines?: boolean } = {}) {
  spy.reset();
  offline.reset();
  setOnline(true);
  freshOfflineDb();
  signIn(USER);
  await offlineDb().libraryCache.bulkPut(
    LIBRARY.map((exercise) => ({ key: `${USER}:${exercise.id}`, userId: USER, exercise })),
  );
  if (opts.routines !== false) await putRoutine(R, "Lower A", R_ITEMS);
}

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

export function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path="/plan/routines/new" element={<RoutineEditor />} />
        <Route path="/plan/routines/:routineId" element={<RoutineEditor />} />
        <Route path="/plan" element={<div data-screen-id="UF-11.2" />} />
      </Routes>
    </MemoryRouter>,
  );
}

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const FIXED_COLUMNS = {
  sets: 3,
  reps_min: null,
  reps_max: null,
  duration_s: null,
  progression: "double_progression",
};

export function itemRow(routineId: string, position: number, exerciseId: string) {
  return { routine_id: routineId, position, exercise_id: exerciseId, ...FIXED_COLUMNS };
}
