// T-0203b unit tests for GET /balance's handler core (D-0037 §1, §9; D-0053 §6).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { balance } from "@workoutlab/engine";
import type { AuthContext } from "../../../functions/_shared/auth.ts";
import { profileMissing } from "../../../functions/_shared/errors.ts";
import type { EngineInputs } from "../../../functions/_shared/repo.ts";
import { getBalanceCore, type BalanceDeps } from "../../../functions/balance/core.ts";
import {
  historyFixture,
  libraryFixture,
  NOW,
  nineAreaTargets,
  PROFILE_A,
  TZ,
} from "./fixtures/inputs.ts";

const FAKE_CTX: AuthContext = { userId: "user-a", supabase: {} as never };

function inputsFixture(overrides: Partial<EngineInputs> = {}): EngineInputs {
  return {
    profile: PROFILE_A,
    targets: nineAreaTargets(),
    history: historyFixture(),
    library: libraryFixture(),
    ...overrides,
  };
}

function depsFixture(overrides: Partial<BalanceDeps> = {}): BalanceDeps {
  return {
    now: () => NOW,
    loadEngineInputs: async () => inputsFixture(),
    balance,
    ...overrides,
  };
}

function balanceSpy() {
  let calls = 0;
  const spy: typeof balance = (...args) => {
    calls++;
    return balance(...args);
  };
  return { spy, calls: () => calls };
}

Deno.test("AC17: no tz is 400, engine never called", async () => {
  const { spy, calls } = balanceSpy();
  const deps = depsFixture({ balance: spy });
  await assertRejectsWithStatus(() => getBalanceCore(FAKE_CTX, null, deps), 400);
  assertEquals(calls(), 0);
});

Deno.test("AC17: tz=Mars/Base is 400, engine never called", async () => {
  const { spy, calls } = balanceSpy();
  const deps = depsFixture({ balance: spy });
  await assertRejectsWithStatus(() => getBalanceCore(FAKE_CTX, "Mars/Base", deps), 400);
  assertEquals(calls(), 0);
});

Deno.test("AC18: profile missing (8 area_targets) is 422, engine never called", async () => {
  const { spy, calls } = balanceSpy();
  const deps = depsFixture({
    balance: spy,
    loadEngineInputs: () => {
      throw profileMissing();
    },
  });
  await assertRejectsWithStatus(() => getBalanceCore(FAKE_CTX, TZ, deps), 422);
  assertEquals(calls(), 0);
});

Deno.test(
  "AC19: zero history returns 9 areas, each at 0 weighted sets and coverageStep 0",
  async () => {
    const deps = depsFixture({ loadEngineInputs: async () => inputsFixture({ history: [] }) });
    const result = await getBalanceCore(FAKE_CTX, TZ, deps);
    assertEquals(result.areas.length, 9);
    for (const area of result.areas) {
      assertEquals(area.load, 0);
      assertEquals(area.coverageStep, 0);
      assertEquals(area.days.length, 14);
      assertEquals(
        area.days.every((d) => d === 0),
        true,
      );
    }
  },
);

Deno.test(
  "AC21: returning after 10 days off — chest counts 3 sets, back counts 0, 14 days entries",
  async () => {
    const history = [
      ...Array.from({ length: 3 }, (_, i) => ({
        clientId: `bench-${i}`,
        sessionId: "sess-bench",
        exerciseId: "barbell-bench-press",
        isWarmup: false,
        completedAt: new Date(new Date(NOW).getTime() - 10 * 86400000).toISOString(),
        editedAt: new Date(new Date(NOW).getTime() - 10 * 86400000).toISOString(),
        deletedAt: null,
        reps: 8,
        weightKg: 60,
        durationS: null,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        clientId: `row-${i}`,
        sessionId: "sess-row",
        exerciseId: "barbell-row",
        isWarmup: false,
        completedAt: new Date(new Date(NOW).getTime() - 16 * 86400000).toISOString(),
        editedAt: new Date(new Date(NOW).getTime() - 16 * 86400000).toISOString(),
        deletedAt: null,
        reps: 8,
        weightKg: 50,
        durationS: null,
      })),
    ];
    const deps = depsFixture({ loadEngineInputs: async () => inputsFixture({ history }) });
    const result = await getBalanceCore(FAKE_CTX, TZ, deps);
    const chest = result.areas.find((a) => a.area === "chest");
    const back = result.areas.find((a) => a.area === "back");
    assert(chest);
    assert(back);
    assertEquals(chest!.load, 3);
    assertEquals(back!.load, 0);
    assertEquals(chest!.days.length, 14);
  },
);

// --- helpers ---------------------------------------------------------------------------------

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
