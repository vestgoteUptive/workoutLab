// T-0979 AC4, AC6, AC8 (UF-09.3, UF-09.4, UF-09.7; D-0260, D-0261, D-0263 §3 §5, D-0267): a flagged
// set paints "per arm" in the same synchronous render() return when the in-memory flag store is warm.
// The cold path (store empty) is today's behaviour: no label first, one detail read, label after.
import { act, cleanup, render, screen } from "@testing-library/react";
import type { SessionPlan, Unilateral } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { invalidateCacheWrites } from "../../../lib/offline/cache-generation.js";
import { offlineDb, userScopedKey } from "../../../lib/offline/db.js";
import { warmUnilateralFlags } from "../../../lib/offline/unilateral-flags.js";
import { ConfirmSet } from "../confirm-set.js";
import { CurrentSet } from "../current-set.js";
import { initialFocusState, type FocusState } from "../machine.js";
import { FocusSessionContext, type FocusSession } from "../session.js";
import { TimedSet } from "../timed-set.js";
import { loggedSets } from "./countdown-helpers.js";
import { BENCH, L1, P1, PLANK, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { freshDb, signIn } from "./helpers.js";
import { NBSP, planOf } from "./set-loop-fixtures.js";

vi.mock("../../../lib/offline/index.js", async (orig) => {
  const real = await orig<typeof import("../../../lib/offline/index.js")>();
  return { ...real, loadExerciseDetail: vi.fn(real.loadExerciseDetail) };
});
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: "signed-in" }) }));
vi.mock("../../../lib/offline/sync.js", () => ({
  startSync: () => ({ flushNow: () => Promise.resolve(), stop: () => undefined }),
}));
const fromSpy = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: fromSpy } }));

const NOW = STARTED_AT_MS + 10 * 60_000;
const detailSpy = vi.mocked(offline.loadExerciseDetail);
const real = detailSpy.getMockImplementation()!;

const ROW_SET: SessionPlan = planOf([
  {
    ...BENCH,
    exerciseId: "dumbbell-row",
    prefill: { ...BENCH.prefill, weightKg: 12, reps: 10 },
  },
]);
const BACK_SQUAT: SessionPlan = planOf([
  { ...BENCH, exerciseId: "back-squat", prefill: { ...BENCH.prefill, weightKg: 80, reps: 6 } },
]);
const PLANK_SET: SessionPlan = planOf([{ ...PLANK, exerciseId: "side-plank" }]);

async function seedDetails() {
  const rows: Array<[string, Unilateral | null]> = [
    ["dumbbell-row", "arm"],
    ["side-plank", "side"],
    ["back-squat", null],
  ];
  await offlineDb().exerciseDetails.bulkPut(
    rows.map(([id, unilateral]) => ({
      key: userScopedKey(USER_A, id),
      userId: USER_A,
      detail: {
        id,
        instructions: [],
        mistakes: [],
        cue: null,
        source: "t",
        license: "CC0",
        attribution: null,
        sourceUrl: null,
        unilateral,
        variants: [],
      },
    })),
  );
}

const session = {
  recordSet: vi.fn(),
  editSet: vi.fn(),
  adjustRest: vi.fn(),
  skipRest: vi.fn(),
} as unknown as FocusSession;

type Phase = "set" | "confirm" | "timed";

function mount(plan: SessionPlan, phase: Phase) {
  const base = initialFocusState(S1, plan, NOW);
  const state: FocusState = {
    ...base,
    phase,
    itemIndex: 0,
    setIndex: 0,
    loggedSets: phase === "confirm" ? loggedSets(0, 1, plan, { reps: 10, weightKg: 12 }) : [],
    timer: phase === "timed" ? { startedAtMs: NOW, durationS: 60, pausedMs: 0 } : null,
  };
  const View = phase === "set" ? CurrentSet : phase === "confirm" ? ConfirmSet : TimedSet;
  return render(
    <FocusSessionContext.Provider value={session}>
      <View
        state={state}
        ctx={{ plan, library: L1 }}
        locale="en-GB"
        nowMs={NOW}
        seams={[]}
        send={() => undefined}
        onResume={() => undefined}
        onCancelAutosave={() => undefined}
        onSaved={() => undefined}
      />
    </FocusSessionContext.Provider>,
  );
}

const load = () => document.querySelector(".wl-uf09__load") as HTMLElement;

beforeEach(async () => {
  window.localStorage.clear();
  freshDb();
  signIn(USER_A);
  invalidateCacheWrites();
  detailSpy.mockReset();
  detailSpy.mockImplementation(real);
  await seedDetails();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("T-0979 AC4 the first frame, warm (UF-09)", () => {
  beforeEach(async () => {
    await warmUnilateralFlags();
  });

  it("T-0979 AC4 UF-09.3 reps line is labelled in the same synchronous render() return", () => {
    mount(ROW_SET, "set");
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toBe(`12${NBSP}kg, 10 reps per arm`);
    const visible = [...load().querySelectorAll(".wl-uf09__hero")].map((e) => e.textContent);
    expect(visible).toEqual([`12${NBSP}kg `, "× 10 per arm"]);
  });

  it("T-0979 AC4 UF-09.4 group is 'Reps per arm' with the caption 'per arm' in the first return", () => {
    mount(ROW_SET, "confirm");
    expect(screen.getByRole("group", { name: "Reps per arm" })).toBeInTheDocument();
    expect(screen.getByText("per arm")).toBeInTheDocument();
  });

  it("T-0979 AC4 UF-09.7 the hold target reads 'per side' in the first return", () => {
    mount(PLANK_SET, "timed");
    expect(document.body.textContent).toMatch(/per side/);
  });

  it("T-0979 AC4 sibling: an unflagged back-squat set shows no label in that first return", () => {
    mount(BACK_SQUAT, "set");
    expect(load().textContent).toBe(`80${NBSP}kg × 6`);
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
    cleanup();
    mount(BACK_SQUAT, "confirm");
    expect(screen.getByRole("group", { name: "Reps" })).toBeInTheDocument();
  });
});

describe("T-0979 AC6 cold path unchanged", () => {
  it("T-0979 AC6 first return has no label, one read per id, label after the read, second mount warm", async () => {
    let release: (() => void) | undefined;
    detailSpy.mockImplementation(async (id) => {
      await new Promise<void>((r) => (release = r));
      return real(id);
    });
    mount(ROW_SET, "set");
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
    expect(load().textContent).toBe(`12${NBSP}kg × 10`);
    await act(async () => {
      await Promise.resolve();
    });
    expect(detailSpy.mock.calls.filter((c) => c[0] === "dumbbell-row")).toHaveLength(1);
    await act(async () => {
      release?.();
      await vi.waitFor(() => expect(load().textContent).toMatch(/per arm/));
    });
    cleanup();
    detailSpy.mockClear();
    mount(ROW_SET, "set");
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toMatch(/per arm/);
  });

  it("T-0979 AC6 a rejected read gives no label, no throw, no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const on = (r: unknown) => unhandled.push(r);
    process.on("unhandledRejection", on);
    detailSpy.mockImplementation(async () => {
      throw new Error("idb down");
    });
    mount(ROW_SET, "set");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    process.off("unhandledRejection", on);
    expect(load().querySelector(".wl-uf09__sr")).toBeNull();
    expect(unhandled).toEqual([]);
  });
});

describe("T-0979 AC8 offline start (UF-09)", () => {
  it("T-0979 AC8 store warmed by AutoSync from the cache, onLine false, labels the first frame", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { AutoSync } = await import("../../../lib/offline/AutoSync.js");
    render(<AutoSync />);
    await vi.waitFor(() => expect(offline.peekUnilateral("dumbbell-row")).toBe("arm"));
    cleanup();
    mount(ROW_SET, "set");
    expect(load().querySelector(".wl-uf09__sr")?.textContent).toMatch(/per arm/);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

void P1;
