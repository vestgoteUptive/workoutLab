// T-0566 UF-08.1 (D-0202 §4): POST /workouts/suggest accepts sessionInput.favoriteIds and passes
// it to the engine. Injected deps + a fixed clock: no Docker, no Deno.serve.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { suggest } from "@workoutlab/engine";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
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

function deps(history = historyFixture(), spy: typeof suggest = suggest): SuggestDeps {
  return {
    now: () => NOW,
    loadEngineInputs: async () => ({
      profile: PROFILE_A,
      targets: nineAreaTargets(),
      history,
      library: libraryFixture(),
    }),
    suggest: spy,
  };
}

async function rejects400(favoriteIds: unknown) {
  let threw = false;
  try {
    await suggestWorkoutCore(
      FAKE_CTX,
      { sessionInput: { ...SESSION_INPUT, favoriteIds }, tz: TZ },
      deps(),
    );
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, 400);
    assertEquals((err as { code?: string }).code, "invalid_request");
    assert((err as Error).message.includes("sessionInput.favoriteIds"), (err as Error).message);
  }
  assert(threw, "expected a 400");
}

Deno.test("T-0566 AC1: without favoriteIds the body equals the pre-change snapshot", async () => {
  const snapshot = JSON.parse(
    await Deno.readTextFile(
      new URL("./fixtures/suggest-30min-no-avoid.snapshot.json", import.meta.url),
    ),
  );
  const w = await suggestWorkoutCore(FAKE_CTX, { sessionInput: SESSION_INPUT, tz: TZ }, deps());
  assertEquals(JSON.parse(JSON.stringify(w)), snapshot);
});

Deno.test("T-0566 AC2: favoriteIds reaches the engine unchanged", async () => {
  let seen: unknown;
  const spy = ((...args: Parameters<typeof suggest>) => {
    seen = args[4];
    return suggest(...args);
  }) as typeof suggest;
  await suggestWorkoutCore(
    FAKE_CTX,
    { sessionInput: { ...SESSION_INPUT, favoriteIds: ["push-up"] }, tz: TZ },
    deps([], spy),
  );
  assertEquals((seen as { favoriteIds?: string[] }).favoriteIds, ["push-up"]);
});

Deno.test("T-0566 AC2: a favorite changes the plan on an empty history", async () => {
  const base = await suggestWorkoutCore(
    FAKE_CTX,
    { sessionInput: SESSION_INPUT, tz: TZ },
    deps([]),
  );
  const fav = await suggestWorkoutCore(
    FAKE_CTX,
    { sessionInput: { ...SESSION_INPUT, favoriteIds: ["push-up"] }, tz: TZ },
    deps([]),
  );
  assert(
    fav.plan.items.some((i) => i.exerciseId === "push-up"),
    "favorite is in the plan",
  );
  assert(!base.plan.items.some((i) => i.exerciseId === "push-up"), "precondition: not without");
});

Deno.test("T-0566 AC3: a non-array or non-string entry is 400", async () => {
  await rejects400("push-up");
  await rejects400([3]);
  await rejects400(null);
  await rejects400([""]);
});

Deno.test("T-0566 AC3: duplicate ids are 400 (uniqueItems)", async () => {
  await rejects400(["push-up", "push-up"]);
});
