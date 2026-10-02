// T-0203b unit tests for POST /workouts/suggest's handler core (D-0037 §1, §9; D-0053 §6).
// Injected deps + a fixed clock: no Docker, no Deno.serve.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggest } from "@workoutlab/engine";
import type { EngineProfile } from "@workoutlab/shared";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import { profileMissing } from "../../../functions/_shared/errors.ts";
import type { EngineInputs } from "../../../functions/_shared/repo.ts";
import {
  readSuggestBody,
  suggestWorkoutCore,
  type SuggestDeps,
} from "../../../functions/workouts/core.ts";
import {
  historyFixture,
  libraryFixture,
  NOW,
  nineAreaTargets,
  PROFILE_A,
  TZ,
} from "./fixtures/inputs.ts";

const FAKE_CTX: AuthContext = { userId: "user-a", supabase: {} as never };

const SESSION_INPUT_30 = {
  budgetMin: 30,
  warmupInBudget: true,
  energy: "normal" as const,
  shuffle: 0,
  mainLiftId: null,
  pinnedIds: [],
  excludeIds: [],
};

function inputsFixture(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    profile: PROFILE_A,
    targets: nineAreaTargets(),
    history: historyFixture(),
    library: libraryFixture(),
    ...overrides,
  };
}

function depsFixture(overrides: Partial<SuggestDeps> = {}): SuggestDeps {
  return {
    now: () => NOW,
    loadEngineInputs: async () => inputsFixture(),
    suggest,
    ...overrides,
  };
}

function suggestSpy() {
  let calls = 0;
  const spy: typeof suggest = (...args) => {
    calls++;
    return suggest(...args);
  };
  return { spy, calls: () => calls };
}

Deno.test(
  "AC13: suggest handler core is deterministic and matches the vendored suggest() directly",
  async () => {
    const deps = depsFixture();
    const body = { sessionInput: SESSION_INPUT_30, tz: TZ };

    const a = await suggestWorkoutCore(FAKE_CTX, body, deps);
    const b = await suggestWorkoutCore(FAKE_CTX, body, deps);
    assertEquals(a, b);

    const inputs = inputsFixture();
    const direct = suggest(
      inputs.history,
      inputs.targets,
      { level: inputs.profile.level, equipment: inputs.profile.equipment },
      inputs.library,
      SESSION_INPUT_30,
      NOW,
      TZ,
    );
    assertEquals(a, direct);
  },
);

Deno.test(
  "AC17: invalid sessionInput.budgetMin (0) is 400 before the engine is called",
  async () => {
    const { spy, calls } = suggestSpy();
    const deps = depsFixture({ suggest: spy });
    const body = { sessionInput: { ...SESSION_INPUT_30, budgetMin: 0 }, tz: TZ };
    await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "budgetMin");
    assertEquals(calls(), 0);
  },
);

Deno.test("AC17: invalid sessionInput.energy is 400 before the engine is called", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: { ...SESSION_INPUT_30, energy: "max" }, tz: TZ };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "energy");
  assertEquals(calls(), 0);
});

Deno.test("AC17: an extra key on sessionInput is 400", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: { ...SESSION_INPUT_30, foo: "bar" }, tz: TZ };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "foo");
  assertEquals(calls(), 0);
});

Deno.test("AC17: a missing tz is 400", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: SESSION_INPUT_30 };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "tz");
  assertEquals(calls(), 0);
});

Deno.test("AC17: tz: Mars/Base is 400", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: SESSION_INPUT_30, tz: "Mars/Base" };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "tz");
  assertEquals(calls(), 0);
});

Deno.test("AC17: budgetMin 481 (over the 480 max) is 400 naming the field", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: { ...SESSION_INPUT_30, budgetMin: 481 }, tz: TZ };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "budgetMin");
  assertEquals(calls(), 0);
});

Deno.test("AC17: budgetMin 30.5 (not an integer) is 400 naming the field", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: { ...SESSION_INPUT_30, budgetMin: 30.5 }, tz: TZ };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "budgetMin");
  assertEquals(calls(), 0);
});

Deno.test("AC17: a top-level extra key on the request body is 400 naming the field", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: SESSION_INPUT_30, tz: TZ, foo: "bar" };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps), "foo");
  assertEquals(calls(), 0);
});

Deno.test("AC17: a body that isn't JSON is 400 invalid_request (readSuggestBody)", async () => {
  const req = new Request("http://localhost/workouts/suggest", {
    method: "POST",
    body: "{not json",
    headers: { "Content-Type": "application/json" },
  });
  await assertRejectsWithStatus(() => readSuggestBody(req), 400);
});

Deno.test("AC18: profile missing (no profiles row) is 422, engine never called", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({
    suggest: spy,
    loadEngineInputs: () => {
      throw profileMissing();
    },
  });
  const body = { sessionInput: SESSION_INPUT_30, tz: TZ };
  await assertRejectsWithStatus(() => suggestWorkoutCore(FAKE_CTX, body, deps), 422);
  assertEquals(calls(), 0);
});

Deno.test(
  "AC19: zero history returns plan.version 1, at least one item, days_since days null",
  async () => {
    const deps = depsFixture({ loadEngineInputs: async () => inputsFixture({ history: [] }) });
    const body = { sessionInput: SESSION_INPUT_30, tz: TZ };
    const workout = await suggestWorkoutCore(FAKE_CTX, body, deps);
    assertEquals(workout.plan.version, 1);
    assert(workout.plan.items.length >= 1);
    assert(workout.unusedS >= 0);
    for (const reason of workout.sessionReasons) {
      if (reason.code === "days_since") assertEquals(reason.days, null);
    }
    for (const item of workout.plan.items) {
      for (const reason of item.reasons) {
        if (reason.code === "days_since") assertEquals(reason.days, null);
      }
    }
  },
);

Deno.test("AC20: budgetMin 1 is 200 with unusedS >= 0 (plan.items may be empty)", async () => {
  const deps = depsFixture();
  const body = { sessionInput: { ...SESSION_INPUT_30, budgetMin: 1 }, tz: TZ };
  const workout = await suggestWorkoutCore(FAKE_CTX, body, deps);
  assert(workout.unusedS >= 0);
});

Deno.test("AC20: budgetMin 480 is 200 with plan.items.length <= 8", async () => {
  const deps = depsFixture();
  const body = { sessionInput: { ...SESSION_INPUT_30, budgetMin: 480 }, tz: TZ };
  const workout = await suggestWorkoutCore(FAKE_CTX, body, deps);
  assert(workout.plan.items.length <= 8);
});

Deno.test("AC21: suggest still returns 200 for a returning-after-10-days-off history", async () => {
  const history = [
    {
      clientId: "s1",
      sessionId: "sess-1",
      exerciseId: "barbell-bench-press",
      isWarmup: false,
      completedAt: new Date(new Date(NOW).getTime() - 10 * 86400000).toISOString(),
      editedAt: new Date(new Date(NOW).getTime() - 10 * 86400000).toISOString(),
      deletedAt: null,
      reps: 8,
      weightKg: 60,
      durationS: null,
    },
  ];
  const deps = depsFixture({ loadEngineInputs: async () => inputsFixture({ history }) });
  const body = { sessionInput: SESSION_INPUT_30, tz: TZ };
  const workout = await suggestWorkoutCore(FAKE_CTX, body, deps);
  assertEquals(workout.plan.version, 1);
});

Deno.test(
  "AC23: deps.loadEngineInputs throwing an internal-looking error propagates (mapped to 500 by the route layer)",
  async () => {
    const deps = depsFixture({
      loadEngineInputs: () => {
        throw new Error("db down: user@example.com");
      },
    });
    const body = { sessionInput: SESSION_INPUT_30, tz: TZ };
    let threw = false;
    try {
      await suggestWorkoutCore(FAKE_CTX, body, deps);
    } catch (err) {
      threw = true;
      assert(err instanceof Error);
      assert((err as Error).message.includes("db down"));
    }
    assert(threw, "expected loadEngineInputs's error to propagate to the route layer");
  },
);

// --- helpers ---------------------------------------------------------------------------------

/** Asserts `fn()` rejects with a 400 `invalid_request` ApiErrorResponse. When `namedField` is
 * given, also asserts the message names that field (so a caller can tell which input was bad). */
async function assertRejectsInvalid(
  fn: () => Promise<unknown>,
  namedField?: string,
): Promise<void> {
  await assertRejectsWithStatus(fn, 400, namedField);
}

async function assertRejectsWithStatus(
  fn: () => Promise<unknown>,
  status: number,
  namedField?: string,
): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, status);
    if (status === 400) {
      assertEquals((err as { code?: string }).code, "invalid_request");
    }
    if (namedField !== undefined) {
      assert(
        (err as Error).message.includes(namedField),
        `expected the message to name "${namedField}": ${(err as Error).message}`,
      );
    }
  }
  assert(threw, `expected the call to throw with status ${status}`);
}

// --- T-0227: POST /workouts/suggest passes profile.goal (D-0095 §5, D-0061 §1) -----------------

type Goal = EngineProfile["goal"];
const GOALS: readonly Goal[] = ["get_stronger", "build_muscle", "general_fitness"];

/** `G(goal)` from the ticket: fixture user A with only the goal changed. */
function G(goal: Goal): EngineProfile {
  return { ...PROFILE_A, goal };
}

/** D-0061 §1 rep-slot table: [main, other compound, isolation] as [min, max] per goal. */
const REP_SLOTS: Record<
  Goal,
  { main: [number, number]; compound: [number, number]; isolation: [number, number] }
> = {
  get_stronger: { main: [3, 5], compound: [5, 8], isolation: [10, 15] },
  build_muscle: { main: [6, 8], compound: [8, 12], isolation: [10, 15] },
  general_fitness: { main: [8, 12], compound: [10, 15], isolation: [10, 15] },
};

const BODY_30 = { sessionInput: SESSION_INPUT_30, tz: TZ };

function goalDeps(goal: Goal, overrides: Partial<EngineInputs> = {}, suggestFn = suggest) {
  return depsFixture({
    suggest: suggestFn,
    loadEngineInputs: async () => inputsFixture({ profile: G(goal), ...overrides }),
  });
}

function profileSpy() {
  const profiles: unknown[] = [];
  const spy: typeof suggest = (...args) => {
    profiles.push(args[2]);
    return suggest(...args);
  };
  return { spy, profiles };
}

for (const goal of GOALS) {
  Deno.test(
    `T-0227 AC1: ${goal} main lift and every other item follow the D-0061 §1 rep slots`,
    async () => {
      const workout = await suggestWorkoutCore(FAKE_CTX, BODY_30, goalDeps(goal));
      const types = new Map(libraryFixture().map((e) => [e.id, e.type]));
      const main = workout.plan.items.find((item) => item.isMain);
      assert(main !== undefined, "expected an isMain item");
      assertEquals([main.repsMin, main.repsMax], REP_SLOTS[goal].main);
      let others = 0;
      for (const item of workout.plan.items) {
        if (item.isMain || item.repsMin === null) continue;
        others++;
        const role = types.get(item.exerciseId) === "isolation" ? "isolation" : "compound";
        assertEquals([item.repsMin, item.repsMax], REP_SLOTS[goal][role], item.exerciseId);
      }
      assert(others >= 1, "expected at least one non-main, non-timed item");
    },
  );

  Deno.test(`T-0227 AC2: ${goal} reaches the engine as the third suggest argument`, async () => {
    const { spy, profiles } = profileSpy();
    const workout = await suggestWorkoutCore(FAKE_CTX, BODY_30, goalDeps(goal, {}, spy));
    assertEquals(profiles, [
      { level: "intermediate", equipment: ["barbell", "rack", "bench", "dumbbell"], goal },
    ]);
    const inputs = inputsFixture({ profile: G(goal) });
    const direct = suggest(
      inputs.history,
      inputs.targets,
      { level: inputs.profile.level, equipment: inputs.profile.equipment, goal },
      inputs.library,
      SESSION_INPUT_30,
      NOW,
      TZ,
    );
    assertEquals(workout, direct);
  });
}

Deno.test("T-0227 AC3: the goal never changes selection, sets or cost", async () => {
  const shapes = [];
  for (const goal of GOALS) {
    const w = await suggestWorkoutCore(FAKE_CTX, BODY_30, goalDeps(goal));
    shapes.push({
      items: w.plan.items.map((item) => [item.exerciseId, item.sets, item.costS]),
      itemsTotalS: w.itemsTotalS,
      totalS: w.totalS,
      unusedS: w.unusedS,
    });
  }
  assertEquals(shapes[1], shapes[0]);
  assertEquals(shapes[2], shapes[0]);

  const buildMuscle = await suggestWorkoutCore(FAKE_CTX, BODY_30, goalDeps("build_muscle"));
  const inputs = inputsFixture();
  const noGoal = suggest(
    inputs.history,
    inputs.targets,
    { level: inputs.profile.level, equipment: inputs.profile.equipment },
    inputs.library,
    SESSION_INPUT_30,
    NOW,
    TZ,
  );
  assertEquals(buildMuscle, noGoal);
});

for (const goal of GOALS) {
  Deno.test(
    `T-0227 AC4: ${goal} with zero history prefills the main lift at the goal's low`,
    async () => {
      const workout = await suggestWorkoutCore(FAKE_CTX, BODY_30, goalDeps(goal, { history: [] }));
      assertEquals(workout.plan.version, 1);
      const main = workout.plan.items.find((item) => item.isMain);
      assert(main !== undefined, "expected an isMain item");
      assertEquals(main.prefill.reps, REP_SLOTS[goal].main[0]);
      assertEquals(main.prefill.kind, "first_time");
    },
  );

  Deno.test(
    `T-0227 AC4: ${goal} returning after 10 days off prefills within the goal's slot`,
    async () => {
      const at = new Date(new Date(NOW).getTime() - 10 * 86400000).toISOString();
      const history = [
        {
          clientId: "s1",
          sessionId: "sess-1",
          exerciseId: "barbell-bench-press",
          isWarmup: false,
          completedAt: at,
          editedAt: at,
          deletedAt: null,
          reps: 8,
          weightKg: 60,
          durationS: null,
        },
      ];
      const workout = await suggestWorkoutCore(FAKE_CTX, BODY_30, goalDeps(goal, { history }));
      assertEquals(workout.plan.version, 1);
      const main = workout.plan.items.find((item) => item.isMain);
      assert(main !== undefined, "expected an isMain item");
      assertEquals([main.repsMin, main.repsMax], REP_SLOTS[goal].main);
      assert(main.prefill.reps !== null, "expected prefilled reps");
      assert(
        main.prefill.reps >= main.repsMin! && main.prefill.reps <= main.repsMax!,
        `prefill ${main.prefill.reps} outside [${main.repsMin}, ${main.repsMax}]`,
      );
    },
  );

  Deno.test(
    `T-0227 AC4: ${goal} profile missing is 422 and the engine is never called`,
    async () => {
      const { spy, profiles } = profileSpy();
      const deps = depsFixture({
        suggest: spy,
        loadEngineInputs: () => {
          throw profileMissing();
        },
      });
      await assertRejectsWithStatus(() => suggestWorkoutCore(FAKE_CTX, BODY_30, deps), 422);
      assertEquals(profiles.length, 0);
    },
  );

  Deno.test(`T-0227 AC4: ${goal} two runs are deep-equal`, async () => {
    const deps = goalDeps(goal);
    const a = await suggestWorkoutCore(FAKE_CTX, BODY_30, deps);
    const b = await suggestWorkoutCore(FAKE_CTX, BODY_30, deps);
    assertEquals(a, b);
  });
}
