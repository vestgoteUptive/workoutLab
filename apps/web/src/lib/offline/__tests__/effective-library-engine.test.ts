// T-0954 (D-0251, D-0252 §2, D-0259 §13): the effective library built from the device store feeds
// the engine. AC2 (suggest, prefill, applySwap agree on one step), AC9 (a shown pre-fill stays),
// AC11 (first time unchanged), AC12 (off-grid history). Uses the engine's own L1 library and
// history fixtures; the engine imports are the same pure functions the web calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySwap, prefill, suggest, type PrefillSlot } from "@workoutlab/engine";
import type { HistorySet, LibraryExercise } from "@workoutlab/shared";
import {
  F_PROFILE,
  F_TARGETS,
  LIBRARY,
  NOW,
  TZ,
  input,
  setsWithReps,
} from "../../../../../../packages/engine/test/fixtures/common.js";
import { fakeSupabase, newServer } from "./exercise-settings-fake.js";

const h = vi.hoisted(() => ({ server: null as unknown }));
vi.mock("../../auth/client.js", () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (fakeSupabase(h.server as ReturnType<typeof newServer>) as Record<string, unknown>)[
          prop as string
        ],
    },
  ),
}));

const { setExerciseStep, resetExerciseStep } = await import("../exercise-settings.js");
const { loadLibrary } = await import("../history.js");
const { offlineDb, userScopedKey } = await import("../db.js");
const { freshOfflineDb, signIn, signOut } = await import("./test-helpers.js");

const A = "11111111-1111-4111-8111-111111111111";
const MAIN: PrefillSlot = { repsMin: 6, repsMax: 8 };

const sets = (date: string, id: string, w: number, reps: number, n: number, rir: number | null) =>
  setsWithReps(
    date,
    id,
    Array.from({ length: n }, () => [w, reps] as const),
    {},
  ).map((s) => ({ ...s, rir }) as HistorySet);

async function seed() {
  await offlineDb().libraryCache.bulkPut(
    LIBRARY.map((exercise) => ({
      key: userScopedKey(A, exercise.id),
      userId: A,
      exercise: exercise as unknown as LibraryExercise,
    })),
  );
}
const find = (lib: readonly LibraryExercise[], id: string) => lib.find((e) => e.id === id)!;

beforeEach(async () => {
  h.server = newServer();
  freshOfflineDb();
  signIn(A);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await seed();
});
afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("T-0954 AC2 one step for suggest, prefill and applySwap", () => {
  const high = input({
    energy: "high",
    budgetMin: 15,
    warmupInBudget: false,
    mainLiftId: "bench-press",
  });
  const h80 = sets("2026-09-24", "bench-press", 80, 5, 3, null);

  it("override 1.25 on bench-press: back-off 71.25 x 6 (70 x 6 without), swap back-off and the next pre-fill 81.25", async () => {
    const item = (lib: readonly LibraryExercise[]) =>
      suggest(h80, F_TARGETS, F_PROFILE, lib, high, NOW, TZ).plan.items.find(
        (i) => i.exerciseId === "bench-press",
      );
    expect(item(await loadLibrary())?.backoff).toEqual({ weightKg: 70, reps: 6 });

    await setExerciseStep("bench-press", 1.25);
    await setExerciseStep("db-bench-press", 1.25);
    const eff = await loadLibrary();
    expect(item(eff)?.prefill).toMatchObject({ weightKg: 80, reps: 6 });
    expect(item(eff)?.backoff).toEqual({ weightKg: 71.25, reps: 6 });

    const plan = suggest(h80, F_TARGETS, F_PROFILE, eff, high, NOW, TZ);
    const swapped = applySwap(
      plan,
      "bench-press",
      "db-bench-press",
      null,
      h80,
      F_PROFILE,
      eff,
      NOW,
      TZ,
    );
    expect(swapped.plan.items.find((i) => i.exerciseId === "db-bench-press")?.backoff).toEqual({
      weightKg: 71.25,
      reps: 6,
    });

    const after = sets("2026-09-24", "bench-press", 80, 8, 3, 3);
    expect(prefill(find(eff, "bench-press"), MAIN, after, eff, NOW, TZ, null)).toMatchObject({
      weightKg: 81.25,
      reps: 6,
      kind: "increase",
    });
  });
});

describe("T-0954 AC9 a shown pre-fill stays; the next computation uses the new step", () => {
  it("the stored plan keeps 82.5; a fresh computation after the override gives 81.25", async () => {
    const hist = sets("2026-09-24", "bench-press", 80, 8, 3, 3);
    const plan = suggest(
      hist,
      F_TARGETS,
      F_PROFILE,
      await loadLibrary(),
      input({ mainLiftId: "bench-press" }),
      NOW,
      TZ,
    );
    const shown = plan.plan.items.find((i) => i.exerciseId === "bench-press")?.prefill;
    expect(shown).toMatchObject({ weightKg: 82.5 });
    // The running workout holds this plan (the session row stores it).
    await offlineDb().sessions.put({
      id: "S9",
      userId: A,
      row: { id: "S9", started_at: NOW, ended_at: null, plan: plan.plan } as never,
      finished: false,
      pending: true,
    });

    await setExerciseStep("bench-press", 1.25);

    const stored = (await offlineDb().sessions.get("S9"))?.row.plan as typeof plan.plan;
    expect(stored.items.find((i) => i.exerciseId === "bench-press")?.prefill).toEqual(shown);
    const next = prefill(
      find(await loadLibrary(), "bench-press"),
      MAIN,
      hist,
      await loadLibrary(),
      NOW,
      TZ,
      null,
    );
    expect(next.weightKg).toBe(81.25);
  });
});

describe("T-0954 AC5 reset returns the engine to the library step", () => {
  it("after a reset the pre-fill steps by 2.5 again", async () => {
    const hist = sets("2026-09-24", "bench-press", 80, 8, 3, 3);
    await setExerciseStep("bench-press", 1.25);
    await resetExerciseStep("bench-press");
    const lib = await loadLibrary();
    expect(prefill(find(lib, "bench-press"), MAIN, hist, lib, NOW, TZ, null).weightKg).toBe(82.5);
  });
});

describe("T-0954 AC11 first time is unchanged by an override", () => {
  it("no history: the first-time pre-fill is the same with and without the override", async () => {
    const base = await loadLibrary();
    const before = prefill(find(base, "bench-press"), MAIN, [], base, NOW, TZ, null);
    await setExerciseStep("bench-press", 1.25);
    const lib = await loadLibrary();
    const after = prefill(find(lib, "bench-press"), MAIN, [], lib, NOW, TZ, null);
    expect(after).toEqual(before);
    expect(after.kind).toBe("first_time");
  });
});

describe("T-0954 AC12 an off-grid last weight takes W + the new step", () => {
  it("history 80 x 8, 8, 8 at RIR 3 under a 2.5 step, new step 1.25: 81.25 (W not re-rounded)", async () => {
    await setExerciseStep("bench-press", 1.25);
    const lib = await loadLibrary();
    const hist = sets("2026-09-24", "bench-press", 80, 8, 3, 3);
    expect(prefill(find(lib, "bench-press"), MAIN, hist, lib, NOW, TZ, null).weightKg).toBe(81.25);
    // Truly off the new grid (81 is not a multiple of 1.25): still W + step, not re-rounded.
    const off = sets("2026-09-24", "bench-press", 81, 8, 3, 3);
    expect(prefill(find(lib, "bench-press"), MAIN, off, lib, NOW, TZ, null).weightKg).toBe(82.25);
  });
});
