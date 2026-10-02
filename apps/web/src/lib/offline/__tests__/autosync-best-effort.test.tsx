// T-0378 UF-02.1 (D-0104): AutoSync's background `refreshAll` is best-effort. A failed Supabase
// read never becomes an unhandled rejection or a `console.error` (AC-1), the failed table keeps
// its previous cache rows while the other tables still refresh (AC-2), and `refreshAll` itself
// still rejects for its awaiting callers in UF-04 and UF-10 (AC-4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { toLibraryExercise } from "@workoutlab/shared";
import { createSelectSpy } from "./select-spy.js";

const spy = createSelectSpy();
vi.mock("../../auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../auth/auth-context.js", () => ({ useAuth: () => ({ status: "signed-in" }) }));
// The flush loop isn't under test here: only the refresh call site is (D-0104 §2).
vi.mock("../sync.js", () => ({
  startSync: () => ({ flushNow: () => Promise.resolve(), stop: () => undefined }),
}));

const { AutoSync } = await import("../AutoSync.js");
const { refreshAll, loadLibrary, loadTargets } = await import("../history.js");
const { offlineDb, userScopedKey } = await import("../db.js");
const { seedLibrary } = await import("./seed-library.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const USER = "u1";
const NOW = new Date("2026-09-27T10:00:00.000Z");
const TZ = "Europe/Stockholm";
const BOOM = { message: "boom", code: "501" };
const TABLES = [
  "session_sets_live",
  "exercises",
  "exercise_areas",
  "exercise_variants",
  "area_targets",
  "profiles",
  "sessions",
  "plan_checkins",
  "routines",
  "routine_items",
] as const;

const BASE_EXERCISE = {
  name: "Exercise",
  type: "compound",
  level: "beginner",
  equipment: [],
  instructions: [],
  mistakes: [],
  cue: null,
  source: "workoutlab",
  license: "LicenseRef-workoutLab",
  attribution: null,
  source_url: null,
  kind: "exercise",
  timed: false,
  increment_kg: 2.5,
  default_duration_s: null,
  external_load: true,
};

let rejections: unknown[] = [];
const onRejection = (reason: unknown) => {
  rejections.push(reason);
};

/** At least two macrotask turns, so every refresh (and any rejection) has settled. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function seedCache(): Promise<void> {
  await offlineDb().targetCache.put({
    key: userScopedKey(USER, "chest"),
    userId: USER,
    target: {
      area: "chest",
      setsPer14d: 20,
      source: "default",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  });
  await seedLibrary(USER, [
    toLibraryExercise({ ...BASE_EXERCISE, id: "back-squat", name: "Back squat" } as never, [
      { area_id: "quads", weight: 1 },
    ]),
  ]);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  freshOfflineDb();
  signIn(USER);
  spy.reset();
  for (const t of TABLES) spy.setRows(t, []);
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
  rejections = [];
  process.on("unhandledRejection", onRejection);
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  process.off("unhandledRejection", onRejection);
  consoleError.mockRestore();
  signOut();
});

describe("AC-1 AutoSync: a failed read doesn't throw", () => {
  it("swallows an area_targets failure: no unhandled rejection, no console.error", async () => {
    spy.fail("area_targets", BOOM);

    render(<AutoSync />);
    await settle();

    expect(spy.countFor("area_targets")).toBe(1);
    expect(rejections).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC-2 degrade: the cache is kept and the others still refresh", () => {
  it("keeps the cached target and refreshes the library when only area_targets fails", async () => {
    await seedCache();
    spy.fail("area_targets", BOOM);
    spy.setRows("exercises", [{ ...BASE_EXERCISE, id: "leg-press", name: "Leg press" }]);
    spy.setRows("exercise_areas", [{ exercise_id: "leg-press", area_id: "quads", weight: 1 }]);

    render(<AutoSync />);
    await settle();

    const targets = await loadTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ area: "chest", setsPer14d: 20 });
    expect((await loadLibrary()).map((e) => e.id)).toEqual(["leg-press"]);
    expect(rejections).toHaveLength(0);
  });

  it("keeps both seeded rows when every table fails", async () => {
    await seedCache();
    for (const t of TABLES) spy.fail(t, BOOM);

    render(<AutoSync />);
    await settle();

    expect((await loadTargets()).map((t) => [t.area, t.setsPer14d])).toEqual([["chest", 20]]);
    expect((await loadLibrary()).map((e) => e.id)).toEqual(["back-squat"]);
    expect(rejections).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC-4 refreshAll still rejects (D-0104 §1)", () => {
  it("rejects when area_targets fails, for the awaiting UF-04/UF-10 callers", async () => {
    spy.fail("area_targets", BOOM);
    await expect(refreshAll(NOW, TZ)).rejects.toMatchObject(BOOM);
  });
});
