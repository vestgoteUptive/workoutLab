// T-0203b unit tests for POST /workouts/suggest's handler core (D-0037 §1, §9; D-0053 §6).
// Injected deps + a fixed clock: no Docker, no Deno.serve.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggest } from "@workoutlab/engine";
import type { EngineProfile } from "@workoutlab/shared";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import { profileMissing } from "../../../functions/_shared/errors.ts";
import type { EngineInputs } from "../../../functions/_shared/repo.ts";
import { suggestWorkoutCore, type SuggestDeps } from "../../../functions/workouts/core.ts";
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
    await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps));
    assertEquals(calls(), 0);
  },
);

Deno.test("AC17: invalid sessionInput.energy is 400 before the engine is called", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: { ...SESSION_INPUT_30, energy: "max" }, tz: TZ };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps));
  assertEquals(calls(), 0);
});

Deno.test("AC17: an extra key on sessionInput is 400", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: { ...SESSION_INPUT_30, foo: "bar" }, tz: TZ };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps));
  assertEquals(calls(), 0);
});

Deno.test("AC17: a missing tz is 400", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: SESSION_INPUT_30 };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps));
  assertEquals(calls(), 0);
});

Deno.test("AC17: tz: Mars/Base is 400", async () => {
  const { spy, calls } = suggestSpy();
  const deps = depsFixture({ suggest: spy });
  const body = { sessionInput: SESSION_INPUT_30, tz: "Mars/Base" };
  await assertRejectsInvalid(() => suggestWorkoutCore(FAKE_CTX, body, deps));
  assertEquals(calls(), 0);
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

async function assertRejectsInvalid(fn: () => Promise<unknown>): Promise<void> {
  await assertRejectsWithStatus(fn, 400);
}

async function assertRejectsWithStatus(fn: () => Promise<unknown>, status: number): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, status);
  }
  assert(threw, `expected the call to throw with status ${status}`);
}
