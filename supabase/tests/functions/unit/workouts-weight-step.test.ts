// T-0959 UF-08.2: POST /workouts/suggest builds the effective library from the caller's own
// `exercise_settings` rows (D-0259 §15, D-0252). Injected deps + a fixed clock; the RLS read is a
// fake client that, like the database, returns only the calling user's rows.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggest } from "@workoutlab/engine";
import type { HistorySet, LibraryExercise, WorkoutItem } from "@workoutlab/shared";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import { loadHistoryWindow, type EngineInputs } from "../../../functions/_shared/repo.ts";
import { suggestWorkoutCore, type SuggestDeps } from "../../../functions/workouts/core.ts";
import {
  buildEffectiveLibrary,
  loadExerciseSettings,
} from "../../../functions/workouts/effective-library.ts";
import {
  libraryFixture,
  NOW,
  nineAreaTargets,
  PROFILE_A,
  TZ,
  historyFixture,
} from "./fixtures/inputs.ts";

const BENCH = "barbell-bench-press";
const HIGH = {
  budgetMin: 15,
  warmupInBudget: false,
  energy: "high" as const,
  shuffle: 0,
  mainLiftId: BENCH,
  pinnedIds: [],
  excludeIds: [],
};
const BODY = { sessionInput: HIGH, tz: TZ };

function benchSets(reps: number, rir: number | null): HistorySet[] {
  const at = new Date(new Date(NOW).getTime() - 24 * 3600 * 1000).toISOString();
  return [0, 1, 2].map((i) => ({
    clientId: `b-${i}`,
    sessionId: "s-1",
    exerciseId: BENCH,
    isWarmup: false,
    completedAt: at,
    editedAt: at,
    deletedAt: null,
    reps,
    weightKg: 80,
    durationS: null,
    ...(rir === null ? {} : { rir }),
  }));
}

function inputs(history: HistorySet[]): EngineInputs {
  return { profile: PROFILE_A, targets: nineAreaTargets(), history, library: libraryFixture() };
}

type Row = { user_id: string; exercise_id: string; increment_kg: number };

/** A fake RLS client: `exercise_settings` select returns only `ctx.userId`'s rows. */
function ctxFor(userId: string, table: Row[], error = false): AuthContext {
  const reads: string[] = [];
  const supabase = {
    from(name: string) {
      assertEquals(name, "exercise_settings");
      return {
        select: () => {
          reads.push(userId);
          return Promise.resolve(
            error
              ? { data: null, error: { message: "db down" } }
              : {
                  data: table
                    .filter((r) => r.user_id === userId)
                    .map(({ exercise_id, increment_kg }) => ({ exercise_id, increment_kg })),
                  error: null,
                },
          );
        },
      };
    },
  };
  return { userId, supabase: supabase as never };
}

function deps(history: HistorySet[]): SuggestDeps {
  return {
    now: () => NOW,
    loadEngineInputs: async () => inputs(history),
    loadExerciseSettings,
    suggest,
  };
}

const item = (w: { plan: { items: WorkoutItem[] } }) =>
  w.plan.items.find((i) => i.exerciseId === BENCH);

const A_ROWS: Row[] = [{ user_id: "user-a", exercise_id: BENCH, increment_kg: 1.25 }];

Deno.test("AC1: override 1.25 + High energy: back-off 71.25 x 6, without it 70 x 6", async () => {
  const d = deps(benchSets(5, 3));
  const withOverride = item(await suggestWorkoutCore(ctxFor("user-a", A_ROWS), BODY, d));
  assertEquals(withOverride?.prefill.weightKg, 80);
  assertEquals(withOverride?.prefill.reps, 6);
  assertEquals(withOverride?.backoff, { weightKg: 71.25, reps: 6 });
  const without = item(await suggestWorkoutCore(ctxFor("user-b", A_ROWS), BODY, d));
  assertEquals(without?.backoff, { weightKg: 70, reps: 6 });
});

Deno.test("AC2: B uses the library step; A's row is never returned to B's client", async () => {
  const b = ctxFor("user-b", A_ROWS);
  assertEquals(await loadExerciseSettings(b), []);
  assertEquals(await loadExerciseSettings(ctxFor("user-a", A_ROWS)), [
    { exercise_id: BENCH, increment_kg: 1.25 },
  ]);
  const w = await suggestWorkoutCore(b, BODY, deps(benchSets(5, 3)));
  assertEquals(item(w)?.backoff, { weightKg: 70, reps: 6 });
});

Deno.test("AC3: no settings rows gives exactly today's output (golden)", async () => {
  const history = historyFixture();
  const none = await suggestWorkoutCore(ctxFor("user-a", []), BODY, deps(history));
  const i = inputs(history);
  const direct = suggest(
    history,
    i.targets,
    { level: i.profile.level, equipment: i.profile.equipment, goal: i.profile.goal },
    i.library,
    HIGH,
    NOW,
    TZ,
  );
  assertEquals(none, direct);
});

Deno.test(
  "AC4: the effective library is the library with incrementKg replaced, the same rule as the web",
  () => {
    const lib = libraryFixture();
    const eff = buildEffectiveLibrary(lib, [{ exercise_id: BENCH, increment_kg: 1.25 }]);
    const expected: LibraryExercise[] = lib.map((e) =>
      e.id === BENCH ? { ...e, incrementKg: 1.25 } : e,
    );
    assertEquals(eff, expected);
    assertEquals(lib.find((e) => e.id === BENCH)?.incrementKg, 2.5, "input library not mutated");
    // An override for an unknown exercise changes nothing.
    assertEquals(buildEffectiveLibrary(lib, [{ exercise_id: "nope", increment_kg: 5 }]), lib);
    // The pre-fill (weights and kind) from suggest equals suggest on the hand-built library.
    const h = benchSets(8, 3);
    const i = inputs(h);
    const prof = { level: i.profile.level, equipment: i.profile.equipment, goal: i.profile.goal };
    const viaServer = suggest(h, i.targets, prof, eff, HIGH, NOW, TZ);
    const viaWeb = suggest(h, i.targets, prof, expected, HIGH, NOW, TZ);
    assertEquals(viaServer, viaWeb);
    assertEquals(item(viaServer)?.prefill, item(viaWeb)?.prefill);
  },
);

Deno.test("AC5: RIR 0 on every top-rep set gives the hold_effort pre-fill", async () => {
  const w = await suggestWorkoutCore(ctxFor("user-a", []), BODY, deps(benchSets(8, 0)));
  assertEquals(item(w)?.prefill.kind, "hold_effort");
  assertEquals(item(w)?.prefill.weightKg, 80);
});

Deno.test("AC7: a settings read error is the 500 shape, the engine never runs", async () => {
  let calls = 0;
  const d: SuggestDeps = {
    ...deps(benchSets(5, 3)),
    suggest: (...a) => {
      calls++;
      return suggest(...a);
    },
  };
  let threw = false;
  try {
    await suggestWorkoutCore(ctxFor("user-a", A_ROWS, true), BODY, d);
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, 500);
    assertEquals((err as { code?: string }).code, "internal");
  }
  assert(threw);
  assertEquals(calls, 0);
});

Deno.test(
  "AC5: the history the function loads carries rir into the engine's HistorySet",
  async () => {
    const selects: string[] = [];
    const row = (rir: number | null) => ({
      client_id: "c1",
      session_id: "s1",
      exercise_id: BENCH,
      is_warmup: false,
      completed_at: "2026-09-27T08:00:00Z",
      edited_at: "2026-09-27T08:00:00Z",
      deleted_at: null,
      reps: 8,
      weight_kg: 80,
      duration_s: null,
      rir,
    });
    const chain = {
      eq: () => chain,
      gte: () => chain,
      order: () => chain,
      range: () => Promise.resolve({ data: [row(0), row(null)], error: null }),
    };
    const supabase = {
      from: () => ({
        select: (cols: string) => {
          selects.push(cols);
          return chain;
        },
      }),
    };
    const history = await loadHistoryWindow({ userId: "user-a", supabase: supabase as never }, NOW);
    assert(
      selects[0]
        .split(",")
        .map((c) => c.trim())
        .includes("rir"),
      "select asks for rir",
    );
    assertEquals(
      history.map((h) => (h as { rir?: number | null }).rir),
      [0, null],
    );
  },
);
