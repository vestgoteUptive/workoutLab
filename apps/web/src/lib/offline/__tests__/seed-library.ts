// A small seed for tests that need the offline library cache to answer (T-0365, D-0088 §2).
// Rows are keyed the way `refreshLibrary()` writes them (`${userId}:${id}`), so `loadLibrary()`
// reads them back for the user `signIn(userId)` stored.
import type { LibraryExercise } from "@workoutlab/engine";
import { offlineDb } from "../db.js";

export async function seedLibrary(
  userId: string,
  exercises: readonly LibraryExercise[],
): Promise<void> {
  await offlineDb().libraryCache.bulkPut(
    exercises.map((exercise) => ({ key: `${userId}:${exercise.id}`, userId, exercise })),
  );
}
