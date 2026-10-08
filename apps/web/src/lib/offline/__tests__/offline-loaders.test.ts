// T-0319 AC-5 (every new loader resolves from IndexedDB with a dead network), AC-8 (refreshAll
// runs the three new refreshes once each) and AC-9 (the export surface is read-only).
//
// AC-5 is asserted two ways, because each alone is weak:
//  1. the supabase spy's call count doesn't move (nothing calls the client), and
//  2. `globalThis.fetch` rejects and `navigator.onLine` is false, so any network dependency that
//     bypasses the spy — now or after a refactor — surfaces as a rejection instead of passing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));

const history = await import("../history.js");
const loaders = await import("../feature-loaders.js");
const offlineIndex = await import("../index.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-27T10:00:00.000Z");
const TZ = "Europe/Stockholm";

function seed(): void {
  spy.setRows("session_sets_live", []);
  spy.setRows("exercises", [
    {
      id: "back-squat",
      name: "Back squat",
      type: "compound",
      level: "beginner",
      equipment: [],
      instructions: ["a", "b"],
      mistakes: [],
      cue: "c",
      source: "workoutlab",
      license: "LicenseRef-workoutLab",
      attribution: null,
      source_url: null,
      kind: "exercise",
      timed: false,
      increment_kg: 2.5,
      default_duration_s: null,
      external_load: true,
    },
  ]);
  spy.setRows("exercise_areas", [{ exercise_id: "back-squat", area_id: "quads", weight: 1 }]);
  spy.setRows("exercise_variants", [
    { exercise_id: "back-squat", variant_id: "leg-press" },
    { exercise_id: "back-squat", variant_id: "goblet-squat" },
  ]);
  spy.setRows("area_targets", [
    {
      area_id: "quads",
      sets_per_14d: 12,
      source: "default",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  ]);
  spy.setRows("profiles", [
    {
      goal: "build_muscle",
      level: "beginner",
      equipment: [],
      rhythm_min: 3,
      rhythm_max: 4,
      priority_areas: [],
      onboarded_at: "2026-09-01T00:00:00.000Z",
      plan_changed_at: "2026-09-01T00:00:00.000Z",
    },
  ]);
  spy.setRows("sessions", [
    {
      id: "S1",
      started_at: "2026-09-17T09:00:00.000Z",
      ended_at: null,
      time_budget_min: 45,
      effort_rating: null,
      energy: "normal",
    },
  ]);
  spy.setRows("plan_checkins", [
    {
      id: "ck-2",
      user_id: USER,
      period_index: 2,
      completed_prev: 3,
      completed_last: 5,
      rhythm_min_before: 3,
      rhythm_max_before: 4,
      proposed_min: 4,
      proposed_max: 5,
      proposed_at: "2026-09-26T09:00:00.000Z",
      answer: null,
      answered_at: null,
    },
  ]);
  spy.setRows("routines", [{ id: "R", name: "Lower A", updated_at: "2026-09-20T10:00:00.000Z" }]);
  spy.setRows("routine_items", [{ routine_id: "R", position: 0, exercise_id: "back-squat" }]);
}

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  spy.reset();
  seed();
});

afterEach(() => signOut());

describe("AC-8 refreshAll fills every v2 cache", () => {
  it("selects each new table once and fills all four caches", async () => {
    await history.refreshAll(NOW, TZ);

    expect(spy.countFor("sessions")).toBe(1);
    expect(spy.countFor("plan_checkins")).toBe(1);
    expect(spy.countFor("routines")).toBe(1);
    expect(spy.countFor("routine_items")).toBe(1);
    expect(spy.countFor("exercise_variants")).toBe(1);
    expect(spy.countFor("exercises")).toBe(1);

    expect(await loaders.loadExerciseDetail("back-squat")).not.toBeNull();
    expect(await loaders.loadVariants("back-squat")).toEqual(["goblet-squat", "leg-press"]);
    expect(await loaders.loadSessions()).toHaveLength(1);
    expect(await loaders.loadCheckins()).toHaveLength(1);
    expect(await loaders.loadRoutines()).toHaveLength(1);
  });
});

describe("AC-5 offline loaders", () => {
  it("resolves the same values with a rejecting fetch and navigator.onLine false", async () => {
    await history.refreshAll(NOW, TZ);

    const online = {
      detail: await loaders.loadExerciseDetail("back-squat"),
      variants: await loaders.loadVariants("back-squat"),
      sessions: await loaders.loadSessions(),
      checkins: await loaders.loadCheckins(),
      routines: await loaders.loadRoutines(),
    };

    const callsBefore = spy.calls.length;
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    const onLine = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    try {
      expect(window.navigator.onLine).toBe(false);

      await expect(loaders.loadExerciseDetail("back-squat")).resolves.toEqual(online.detail);
      await expect(loaders.loadVariants("back-squat")).resolves.toEqual(online.variants);
      await expect(loaders.loadSessions()).resolves.toEqual(online.sessions);
      await expect(loaders.loadCheckins()).resolves.toEqual(online.checkins);
      await expect(loaders.loadRoutines()).resolves.toEqual(online.routines);

      // Nothing was awaited on the network: no supabase call, and the rejecting fetch was never
      // even reached.
      expect(spy.calls.length).toBe(callsBefore);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
      if (onLine) Object.defineProperty(window.navigator, "onLine", onLine);
    }
  });

  it("an unknown id still resolves (null/[]) offline rather than reaching out", async () => {
    await history.refreshAll(NOW, TZ);
    const callsBefore = spy.calls.length;
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    try {
      await expect(loaders.loadExerciseDetail("nope")).resolves.toBeNull();
      await expect(loaders.loadVariants("nope")).resolves.toEqual([]);
      expect(spy.calls.length).toBe(callsBefore);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("AC-9 the export surface", () => {
  const V1_EXPORTS = [
    "recordSet",
    "editSet",
    "deleteSet",
    "upsertSession",
    "syncStatus",
    "flush",
    "startSync",
    "refreshAll",
    "refreshHistory",
    "refreshLibrary",
    "refreshTargets",
    "refreshProfile",
    "loadLibrary",
    "loadTargets",
    "loadProfile",
    "lastSyncedAt",
    "HISTORY_WINDOW_DAYS",
    "loadEngineHistory",
    "ensurePersistentStorage",
    "offlineDb",
    "resetOfflineDbForTest",
    "DB_NAME",
    "currentUserId",
  ];
  const T0319_EXPORTS = [
    "refreshSessions",
    "refreshCheckins",
    "refreshRoutines",
    "loadExerciseDetail",
    "loadVariants",
    "loadSessions",
    "loadCheckins",
    "loadRoutines",
  ];

  // T-0536 (D-0199): the excluded-exercises cache, its two online-only writes, the union helper.
  const T0536_EXPORTS = [
    "refreshExcluded",
    "excludeExercise",
    "includeExercise",
    "excludeIdsFor",
    "loadExcludedIds",
    "ExcludedWriteError",
    "useExcludedIds",
    "useExcludedRows",
    "useOnline",
  ];

  it("exports exactly the v1 surface plus the 3 refreshes and 5 loaders added here, plus T-0536's", () => {
    expect(Object.keys(offlineIndex).sort()).toEqual(
      [...V1_EXPORTS, ...T0319_EXPORTS, ...T0536_EXPORTS].sort(),
    );
  });

  it("keeps every v1 export (nothing removed or renamed by the version bump)", () => {
    for (const name of V1_EXPORTS) {
      expect(offlineIndex).toHaveProperty(name);
    }
  });

  it("exports no write helper for routines, check-ins, plans, profiles or area targets", () => {
    // D-0070 §2–§3: those writes are online-only supabase-js calls in the features. A helper
    // here would tempt a feature into writing IndexedDB behind `lib/offline`'s back.
    const banned =
      /^(save|upsert|create|update|delete|put|write|insert|remove)(Routine|RoutineItem|Checkin|CheckIn|Plan|Profile|Target|AreaTarget)/i;
    const offenders = Object.keys(offlineIndex).filter((name) => banned.test(name));
    expect(offenders).toEqual([]);

    // Positively: the only exported functions that write IDB are the v1 queue calls and the
    // refreshes. Nothing named after a feature table is writable from a feature.
    expect(offlineIndex).not.toHaveProperty("saveRoutine");
    expect(offlineIndex).not.toHaveProperty("upsertRoutine");
    expect(offlineIndex).not.toHaveProperty("answerCheckin");
    expect(offlineIndex).not.toHaveProperty("saveProfile");
    expect(offlineIndex).not.toHaveProperty("saveTargets");
  });
});
