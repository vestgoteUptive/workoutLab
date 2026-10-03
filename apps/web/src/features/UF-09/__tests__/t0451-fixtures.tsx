// T-0451 shared setup: the cache UF-05.1 reads, and small DOM helpers. The loader state itself
// lives in each spec file (vi.mock is hoisted per file). A resolved React.lazy stays resolved for
// the life of the module, so each file has at most one test that ends with a successful load.
import { screen } from "@testing-library/react";
import type { EngineProfile, LibraryExercise as EngineExercise } from "@workoutlab/engine";
import type { LibraryExercise } from "@workoutlab/shared";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { USER_A } from "./fixtures.js";
import { flushReal } from "./helpers.js";
import { findEl } from "./set-loop-helpers.js";
import { fireEvent } from "@testing-library/react";

// The cache UF-05.1 reads (as t0422.host.test.tsx): a beginner, full-equipment profile and the
// back-row part of the engine L1 library, so the sheet is titled "Replace Barbell row".
const row = (id: string, equipment: string[], inc: number | "bw"): EngineExercise => ({
  id,
  name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment,
  areas: { back: 1, arms: 0.5 },
  timed: false,
  defaultDurationS: null,
  incrementKg: inc === "bw" ? null : inc,
  externalLoad: inc !== "bw",
});
const LIBRARY = [
  row("barbell-row", ["barbell"], 2.5),
  row("db-row", ["dumbbell", "bench"], 2),
  row("lat-pulldown", ["cable"], 5),
  row("seated-cable-row", ["cable"], 5),
];
const PROFILE: EngineProfile = {
  goal: "build_muscle",
  level: "beginner",
  equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
  rhythmMin: 3,
  rhythmMax: 4,
  priorityAreas: [],
  onboardedAt: "2026-08-02T10:00:00Z",
  planUpdatedAt: "2026-08-02T10:00:00Z",
};

export async function seedSwapCache(): Promise<void> {
  const db = offlineDb();
  await db.profileCache.put({ userId: USER_A, profile: PROFILE as never });
  await db.libraryCache.bulkPut(
    LIBRARY.map((exercise) => ({
      key: userScopedKey(USER_A, exercise.id),
      userId: USER_A,
      exercise: exercise as unknown as LibraryExercise,
    })),
  );
}

export const FAIL = "Couldn't load alternatives.";
export const dialog = () => screen.queryByRole("dialog");
export const buttons = () =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).map((b) => b.textContent);

/** Presses Swap and waits until the overlay has settled: the failure state, or the sheet. */
export async function openSwapSettled(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Swap" }));
  await flushReal();
  await findEl(() => {
    const d = dialog();
    return d && !d.textContent?.includes("Loading alternatives") ? d : null;
  });
}
