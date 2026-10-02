// T-0370 AC-1 (the builder) and AC-3 (the on-disk key format didn't move). UF-04.1/.2/.3.
//
// The rows in AC-3 are written with LITERAL keys, never through `userScopedKey`, so these tests
// pin the format an existing IndexedDB already holds. `loadLibrary()` reads through the `userId`
// index and would pass even if the format moved; the keyed `exerciseDetails.get` in
// `loadExerciseDetail()` is the read that catches it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryExercise } from "@workoutlab/shared";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const { offlineDb, setKey, userScopedKey } = await import("../db.js");
const { loadLibrary } = await import("../history.js");
const { loadExerciseDetail } = await import("../feature-loaders.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const BACK_SQUAT: LibraryExercise = {
  id: "back-squat",
  name: "Back squat",
  kind: "exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  areas: { quads: 1, glutes: 0.5 },
  timed: false,
  incrementKg: 2.5,
  defaultDurationS: null,
  externalLoad: true,
};

beforeEach(() => {
  freshOfflineDb();
});

afterEach(() => signOut());

describe("T-0370 AC-1 the user-scoped key builder", () => {
  it('userScopedKey("u1", "back-squat") is "u1:back-squat"', () => {
    expect(userScopedKey("u1", "back-squat")).toBe("u1:back-squat");
  });

  it('setKey("u1", "c-1") is "u1:c-1"', () => {
    expect(setKey("u1", "c-1")).toBe("u1:c-1");
  });
});

describe("T-0370 AC-3 rows under the literal on-disk key are still read", () => {
  it('loadLibrary() for u1 finds a libraryCache row keyed "u1:back-squat"', async () => {
    await offlineDb().libraryCache.put({
      key: "u1:back-squat",
      userId: "u1",
      exercise: BACK_SQUAT,
    });
    signIn("u1");
    expect(await loadLibrary()).toEqual([BACK_SQUAT]);
  });

  it('loadExerciseDetail() gets an exerciseDetails row keyed "u1:back-squat" by key', async () => {
    const detail = {
      id: "back-squat",
      instructions: ["Brace", "Sit down between your heels"],
      mistakes: ["Knees caving in"],
      cue: "Chest up",
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
      attribution: null,
      sourceUrl: null,
      variants: ["goblet-squat"],
    };
    await offlineDb().exerciseDetails.put({ key: "u1:back-squat", userId: "u1", detail });
    signIn("u1");
    expect(await loadExerciseDetail("back-squat")).toEqual(detail);
  });
});
