// T-0303a UF-08.1 AC-9, queued sets count (R7-E3, NFR-OFF-3): the REAL `loadEngineHistory`,
// `loadLibrary`, `loadTargets` and `loadProfile` over `fake-indexeddb`, with sets queued through
// the real `recordSet`. Offline, so `refreshAll` is never started. Only `suggest` is spied (it
// wraps the real function).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import { recordSet } from "../../../lib/offline/queue.js";
import { resetOfflineDbForTest, userScopedKey, type OfflineDb } from "../../../lib/offline/db.js";
import { NOW, fLibrary, fProfile, fTargets } from "./fixtures.js";
import { fitLine, renderSetup, setOnline } from "./harness.js";

// D-0113: the mount refresh needs a signed-in session. `auth.status` is read on every render.
const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const USER = "22222222-2222-4222-8222-222222222222";
const STORAGE_KEY = "sb-abc-auth-token";
let counter = 0;

async function seed(db: OfflineDb): Promise<void> {
  for (const exercise of fLibrary()) {
    await db.libraryCache.put({
      key: userScopedKey(USER, exercise.id),
      userId: USER,
      exercise: exercise as never,
    });
  }
  for (const target of fTargets()) {
    await db.targetCache.put({ key: userScopedKey(USER, target.area), userId: USER, target });
  }
  await db.profileCache.put({ userId: USER, profile: fProfile() as never });
}

async function queueSquats(n: number): Promise<void> {
  const at = new Date(new Date(NOW).getTime() - 24 * 3_600_000);
  for (let i = 0; i < n; i += 1) {
    await recordSet(
      {
        sessionId: "S-queued",
        exerciseId: "back-squat",
        setIndex: i,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      },
      { now: at },
    );
  }
}

let db: OfflineDb;

beforeEach(async () => {
  auth.status = "signed-in";
  vi.clearAllMocks();
  counter += 1;
  db = resetOfflineDbForTest(`wl-offline-uf08-${counter}`);
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ access_token: "t", expires_at: 9_999_999_999, user: { id: USER } }),
  );
  setOnline(false);
  await seed(db);
});

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY);
  vi.restoreAllMocks();
});

async function thirtyMinuteWorkout(): Promise<Workout> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
  fireEvent.click(screen.getByRole("button", { name: "30 minutes" }));
  return spy.mock.results.at(-1)!.value as Workout;
}

function recoveringSkipped(w: Workout): string[] {
  return w.sessionReasons.flatMap((r) => (r.code === "recovering_skipped" ? [r.area] : []));
}

describe("AC-9 queued sets count (real loadEngineHistory, R7-E3)", () => {
  it("6 queued hard back-squat sets at now − 24 h → recovering_skipped for quads and glutes", async () => {
    await queueSquats(6);
    expect(await db.sets.count()).toBe(6);
    const w = await thirtyMinuteWorkout();
    expect(recoveringSkipped(w)).toEqual(expect.arrayContaining(["quads", "glutes"]));
    expect(w.plan.mainLiftId).toBe("bench-press");
    // The queued rows reached suggest as pending history.
    const history = spy.mock.lastCall![0];
    expect(history).toHaveLength(6);
    expect(history.every((h) => h.pending === true)).toBe(true);
  });

  it("contrast: without the queued sets, neither", async () => {
    const w = await thirtyMinuteWorkout();
    expect(recoveringSkipped(w)).not.toContain("quads");
    expect(recoveringSkipped(w)).not.toContain("glutes");
    expect(spy.mock.lastCall![0]).toEqual([]);
  });
});
