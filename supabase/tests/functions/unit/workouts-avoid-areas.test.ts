// T-0518 UF-08.1 (D-0191 §3): POST /workouts/suggest accepts sessionInput.avoidAreas and passes
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

const LONG_INPUT = { ...SESSION_INPUT, budgetMin: 90 };

function deps(history = historyFixture()): SuggestDeps {
  return {
    now: () => NOW,
    loadEngineInputs: async () => ({
      profile: PROFILE_A,
      targets: nineAreaTargets(),
      history,
      library: libraryFixture(),
    }),
    suggest,
  };
}

async function rejects400(avoidAreas: unknown, named = "sessionInput.avoidAreas") {
  let threw = false;
  try {
    await suggestWorkoutCore(
      FAKE_CTX,
      { sessionInput: { ...SESSION_INPUT, avoidAreas }, tz: TZ },
      deps(),
    );
  } catch (err) {
    threw = true;
    assertEquals((err as { status?: number }).status, 400);
    assertEquals((err as { code?: string }).code, "invalid_request");
    assert((err as Error).message.includes(named), (err as Error).message);
  }
  assert(threw, "expected a 400");
}

Deno.test(
  "T-0518 AC1: avoidAreas [quads, glutes] with zero history keeps those areas out",
  async () => {
    const w = await suggestWorkoutCore(
      FAKE_CTX,
      {
        sessionInput: { ...LONG_INPUT, avoidAreas: ["quads", "glutes"] },
        tz: TZ,
      },
      deps([]),
    );
    const byId = new Map(libraryFixture().map((e) => [e.id, e]));
    assert(w.plan.items.length > 0, "expected a non-empty plan");
    for (const item of w.plan.items) {
      const areas = byId.get(item.exerciseId)!.areas;
      assert(
        areas["quads"] !== 1 && areas["glutes"] !== 1,
        `${item.exerciseId} loads an avoided area`,
      );
    }
    // The fixture library has a quads/glutes-heavy lift, so the flag must change the outcome.
    const without = await suggestWorkoutCore(
      FAKE_CTX,
      { sessionInput: LONG_INPUT, tz: TZ },
      deps([]),
    );
    assert(
      without.plan.items.some((i) => {
        const a = byId.get(i.exerciseId)!.areas;
        return a["quads"] === 1 || a["glutes"] === 1;
      }),
      "precondition: without avoidAreas a quads/glutes weight-1.0 item is suggested",
    );
  },
);

Deno.test("T-0518 AC2: without avoidAreas the body equals the pre-change snapshot", async () => {
  const snapshot = JSON.parse(
    await Deno.readTextFile(
      new URL("./fixtures/suggest-30min-no-avoid.snapshot.json", import.meta.url),
    ),
  );
  const w = await suggestWorkoutCore(
    FAKE_CTX,
    {
      sessionInput: SESSION_INPUT,
      tz: TZ,
    },
    deps(),
  );
  assertEquals(JSON.parse(JSON.stringify(w)), snapshot);
  const empty = await suggestWorkoutCore(
    FAKE_CTX,
    { sessionInput: { ...SESSION_INPUT, avoidAreas: [] }, tz: TZ },
    deps(),
  );
  assertEquals(JSON.parse(JSON.stringify(empty)), snapshot);
});

Deno.test("T-0518 AC3: an unknown area is 400 naming sessionInput.avoidAreas", async () => {
  await rejects400(["legs"]);
  await rejects400(["quads", "Quads"]);
  await rejects400([1]);
});

Deno.test("T-0518 AC3: a non-array avoidAreas is 400", async () => {
  await rejects400("quads");
  await rejects400(null);
  await rejects400({ 0: "quads" });
});

Deno.test("T-0518 AC4: duplicate areas are 400 (uniqueItems)", async () => {
  await rejects400(["quads", "quads"]);
});
