// T-0304e AC-1 (the hook's read fields, D-0066 §12, D-0071 §5) and AC-2 (the `Workout`, D-0066
// §11, D-0069 §5).
import { act, render } from "@testing-library/react";
import { availableS, WARMUP_COST_S } from "@workoutlab/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineDb } from "../../../lib/offline/index.js";
import { initialFocusState, type FocusState } from "../machine.js";
import { useFocusSession } from "../session.js";
import { elapsedS } from "../timer.js";
import { P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { advance, freshDb, seedSession, signIn, useFakeClock } from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, renderSession } from "./session-helpers.js";
import { dispatched, lastStore, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const KEY = `wl-focus:${S1}`;

function seedFocus(state: Partial<FocusState>): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, P1, NOW), timer: null, ...state }),
  );
}

const benchSet0 = {
  sessionId: S1,
  itemIndex: 0,
  exerciseId: "bench-press",
  setIndex: 0,
  kind: "reps" as const,
  reps: 6,
  weightKg: 80,
  isWarmup: false,
  backoff: false,
};

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC-1 read fields", () => {
  it("after bench-press set 1 is recorded 80 × 6 and saved: identity, position, loggedSets, rest, elapsedS", async () => {
    await seedSession();
    seedFocus({ phase: "set", workoutPausedMs: 30_000, warmupSpentMs: 160_000 });
    await renderSession();

    expect(session().rest).toBeNull(); // `set`: outside rest
    const logged = await call(() => session().recordSet(benchSet0));
    expect(session().state.phase).toBe("confirm");
    expect(session().rest).toBeNull(); // `confirm`: outside rest
    act(() => lastStore().dispatch({ type: "SAVED", atMs: Date.now() }));

    const s = session();
    const stored = await offlineDb().sessions.get(S1);
    expect(s.sessionId).toBe("S1");
    expect(s.row).toEqual(stored!.row);
    expect(s.plan).toEqual(stored!.row.plan);
    expect(s.currentItemIndex).toBe(0);
    expect(s.currentSetIndex).toBe(1);
    expect(s.loggedSets).toEqual([
      {
        clientId: logged.clientId,
        itemIndex: 0,
        setIndex: 0,
        exerciseId: "bench-press",
        reps: 6,
        weightKg: 80,
        durationS: null,
        rir: null,
        backoff: false,
      },
    ]);
    expect(typeof logged.clientId).toBe("string");
    expect(s.state.phase).toBe("rest");
    expect(s.rest).toEqual({ remainingS: 120 });

    const at = Date.now();
    expect(s.elapsedS).toBe(
      elapsedS(
        {
          startedAtMs: STARTED_AT_MS,
          workoutPausedMs: 30_000,
          pausedAtMs: null,
          warmupSpentMs: 160_000,
          warmupInBudget: true,
        },
        at,
      ),
    );
    expect(s.elapsedS).toBe(570); // 10 min − 30 s of pauses; the warm-up is in budget

    await advance(5_000);
    expect(session().elapsedS).toBe(575);
  });

  it("elapsedS with the warm-up off budget subtracts warmupSpentMs (the other value)", async () => {
    await seedSession({ warmup_in_budget: false });
    seedFocus({ phase: "set", workoutPausedMs: 30_000, warmupSpentMs: 160_000 });
    await renderSession();
    expect(session().elapsedS).toBe(410);
  });

  it("outside the host the hook throws an Error naming useFocusSession and SessionHost", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Bare() {
      useFocusSession();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(Error);
    expect(() => render(<Bare />)).toThrow(/useFocusSession[\s\S]*SessionHost/);
  });
});

describe("AC-2 the Workout", () => {
  it("P1 with the warm-up in budget", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    const { workout, row } = session();
    expect(workout.plan).toEqual(row.plan);
    expect(workout).toMatchObject({
      budgetMin: 45,
      warmupInBudget: true,
      energy: "normal",
      sessionReasons: [],
      itemsTotalS: 1980,
      totalS: 1980 + WARMUP_COST_S,
    });
    expect(workout.totalS).toBe(2160);
    expect(workout.unusedS).toBe(Math.max(0, availableS(45, true) - 1980));
    expect(workout.unusedS).toBe(540);
  });

  it("warmup_in_budget false: unusedS uses availableS(45, false)", async () => {
    await seedSession({ warmup_in_budget: false });
    seedFocus({ phase: "set" });
    await renderSession();
    const { workout } = session();
    expect(workout.warmupInBudget).toBe(false);
    expect(workout.unusedS).toBe(Math.max(0, availableS(45, false) - 1980));
    expect(workout.unusedS).toBe(720);
  });
});
