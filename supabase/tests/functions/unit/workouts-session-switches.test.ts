// T-0938 UF-08.2 (D-0237, D-0239): POST /workouts/suggest accepts the optional boolean
// sessionInput.autoMainLift and sessionInput.fill and passes them to the engine.
// Injected deps + a fixed clock: no Docker, no Deno.serve.
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggest } from "@workoutlab/engine";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import { validateSessionInput } from "../../../functions/_shared/validate.ts";
import { type SuggestDeps, suggestWorkoutCore } from "../../../functions/workouts/core.ts";
import {
  historyFixture,
  libraryFixture,
  nineAreaTargets,
  NOW,
  PROFILE_A,
  TZ,
} from "./fixtures/inputs.ts";

const FAKE_CTX: AuthContext = { userId: "user-a", supabase: {} as never };

const SESSION_INPUT = {
  budgetMin: 30,
  warmupInBudget: true,
  energy: "normal" as const,
  shuffle: 0,
  mainLiftId: null,
  pinnedIds: [],
  excludeIds: [],
};

function deps(spy: typeof suggest = suggest): SuggestDeps {
  return {
    now: () => NOW,
    loadEngineInputs: async () => ({
      profile: PROFILE_A,
      targets: nineAreaTargets(),
      history: historyFixture(),
      library: libraryFixture(),
    }),
    loadExerciseSettings: async () => [],
    suggest: spy,
  };
}

function assert400(fn: () => unknown, field: string) {
  const err = assertThrows(fn) as { status?: number; code?: string; message: string };
  assertEquals(err.status, 400);
  assertEquals(err.code, "invalid_request");
  assertEquals(err.message, `sessionInput.${field} must be a boolean`);
}

Deno.test("T-0938 AC1: false and false are returned as false", () => {
  const out = validateSessionInput({ ...SESSION_INPUT, autoMainLift: false, fill: false });
  assertEquals(out.autoMainLift, false);
  assertEquals(out.fill, false);
});

Deno.test("T-0938 AC2: true and true are returned as true", () => {
  const out = validateSessionInput({ ...SESSION_INPUT, autoMainLift: true, fill: true });
  assertEquals(out.autoMainLift, true);
  assertEquals(out.fill, true);
});

Deno.test("T-0938 AC2: one key alone does not add the other", () => {
  const out = validateSessionInput({ ...SESSION_INPUT, fill: false });
  assertEquals(out.fill, false);
  assert(!Object.hasOwn(out, "autoMainLift"));
});

Deno.test("T-0938 AC3: without either key the result has neither key", () => {
  const out = validateSessionInput(SESSION_INPUT);
  assert(!Object.hasOwn(out, "autoMainLift"));
  assert(!Object.hasOwn(out, "fill"));
  assertEquals(out, SESSION_INPUT);
});

Deno.test("T-0938 AC4: a non-boolean is 400 naming the field", () => {
  for (const key of ["autoMainLift", "fill"] as const) {
    for (const v of ["false", 0, 1, null]) {
      assert400(() => validateSessionInput({ ...SESSION_INPUT, [key]: v }), key);
    }
  }
});

Deno.test(
  "T-0938 AC5: autoMainLift false + fill false, no pins, no main lift gives no items",
  async () => {
    let seen: unknown;
    const spy = ((...args: Parameters<typeof suggest>) => {
      seen = args[4];
      return suggest(...args);
    }) as typeof suggest;
    const w = await suggestWorkoutCore(
      FAKE_CTX,
      { sessionInput: { ...SESSION_INPUT, autoMainLift: false, fill: false }, tz: TZ },
      deps(spy),
    );
    assertEquals(w.plan.items, []);
    assertEquals((seen as { autoMainLift?: boolean }).autoMainLift, false);
    assertEquals((seen as { fill?: boolean }).fill, false);

    const full = await suggestWorkoutCore(
      FAKE_CTX,
      { sessionInput: SESSION_INPUT, tz: TZ },
      deps(),
    );
    assert(full.plan.items.length > 0, "precondition: the default plan is not empty");
  },
);
