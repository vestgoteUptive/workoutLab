// T-0304e AC-7 (the wall-clock rest helpers, D-0071 §5, NFR-TIME-1) and AC-8 (`close()` from a
// `keepsClockRunning: true` overlay re-syncs the machine from `loggedSets`).
import { act, fireEvent, screen } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import type { SeamAction } from "../seams.js";
import type { FocusSession } from "../session.js";
import { remainingS, type FocusTimer } from "../timer.js";
import { BENCH, P1, PLANK, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, currentLocation, renderSession } from "./session-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const KEY = `wl-focus:${S1}`;

function seedFocus(state: Partial<FocusState>, plan: SessionPlan = P1): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, plan, NOW), timer: null, ...state }),
  );
}

function logged(itemIndex: number, setIndex: number, plan: SessionPlan = P1): LoggedSet {
  const item = plan.items[itemIndex]!;
  return {
    clientId: `c-${itemIndex}-${setIndex}`,
    itemIndex,
    setIndex,
    exerciseId: item.exerciseId,
    reps: item.repsMin === null ? null : 6,
    weightKg: item.repsMin === null ? null : 80,
    durationS: item.repsMin === null ? 50 : null,
    rir: null,
    backoff: setIndex >= item.sets,
  };
}

function storedRemaining(): number {
  return remainingS(storedFocus()!.timer as FocusTimer, Date.now());
}

let ctx: FocusSession | null = null;
const listView: SeamAction = {
  id: "list-view",
  label: "List view",
  keepsClockRunning: true,
  render: (c) => {
    ctx = c;
    return <p data-testid="list-overlay" />;
  },
};

async function openListView(): Promise<FocusSession> {
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  await flushReal();
  expect(screen.getByTestId("list-overlay")).toBeTruthy();
  return ctx!;
}

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  ctx = null;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC-7 rest helpers", () => {
  it("startRest('bench-press') starts a 120 s wall-clock rest: 30 left after 90 s", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    act(() => session().startRest("bench-press"));
    expect(session().rest).toEqual({ remainingS: 120 });
    expect(storedFocus()!.timer).toEqual({ startedAtMs: NOW, durationS: 120, pausedMs: 0 });
    await advance(90_000);
    expect(session().rest).toEqual({ remainingS: 30 });
    expect(session().rest!.remainingS).toBe(
      remainingS(storedFocus()!.timer as FocusTimer, Date.now()),
    );
  });

  it("startRest('leg-curl') starts a 60 s one (isolation)", async () => {
    await seedSession();
    seedFocus({ phase: "set", itemIndex: 2 });
    await renderSession();
    act(() => session().startRest("leg-curl"));
    expect(session().rest).toEqual({ remainingS: 60 });
    await advance(45_000);
    expect(session().rest).toEqual({ remainingS: 15 });
  });

  it("adjustRest(-15) ×9 floors at 0", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    act(() => session().startRest("bench-press"));
    const seen: number[] = [];
    act(() => {
      const s = session();
      for (let i = 0; i < 9; i += 1) {
        s.adjustRest(-15);
        seen.push(storedRemaining());
      }
    });
    expect(seen).toEqual([105, 90, 75, 60, 45, 30, 15, 0, 0]);
  });

  it("adjustRest(15) adds 15 with no cap", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    act(() => session().startRest("bench-press"));
    act(() => session().adjustRest(15));
    expect(session().rest).toEqual({ remainingS: 135 });
    act(() => {
      for (let i = 0; i < 9; i += 1) session().adjustRest(15);
    });
    expect(session().rest).toEqual({ remainingS: 270 });
  });

  it("(c) startRest from an unlogged set: currentSetIndex during that rest is the same set, 0", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() =>
      session().recordSet({
        sessionId: S1,
        itemIndex: 1,
        exerciseId: "barbell-row",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      }),
    );
    act(() => session().startRest("barbell-row"));
    expect(session().state).toMatchObject({ phase: "rest", itemIndex: 0, setIndex: 0 });
    expect(session().currentSetIndex).toBe(0);
    act(() => session().skipRest());
    expect(session().state).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 0 });
  });

  it("the review scenario: List view logs row set 0, starts a rest and closes → bench set 0 is offered after the rest", async () => {
    await seedSession();
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams: { pause: [listView] } });
    const c = await openListView();
    await call(() =>
      c.recordSet({
        sessionId: S1,
        itemIndex: 1,
        exerciseId: "barbell-row",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
      }),
    );
    act(() => c.startRest("barbell-row"));
    act(() => c.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "rest", itemIndex: 0, setIndex: 0 });
    await advance(120_000);
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 0 });
  });

  it("skipRest() sets rest to null", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    act(() => session().startRest("bench-press"));
    expect(session().rest).not.toBeNull();
    act(() => session().skipRest());
    expect(session().rest).toBeNull();
  });
});

describe("AC-8 close() re-sync", () => {
  it("bench sets 0–3 logged, no rest running → set for barbell-row setIndex 0", async () => {
    await seedSession();
    seedFocus({
      phase: "paused",
      resumePhase: "confirm",
      pausedAtMs: NOW,
      setIndex: 3,
      loggedSets: [0, 1, 2, 3].map((i) => logged(0, i)),
    });
    await renderSession({ seams: { pause: [listView] } });
    const c = await openListView();
    expect(storedFocus()).toMatchObject({ phase: "confirm" });
    act(() => c.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 1, setIndex: 0 });
    expect(session().plan.items[1]!.exerciseId).toBe("barbell-row");
  });

  it("a rest running → rest, with the same remaining time", async () => {
    await seedSession();
    seedFocus({
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      timer: { startedAtMs: NOW - 30_000, durationS: 120, pausedMs: 0 },
      loggedSets: [logged(0, 0)],
    });
    await renderSession({ seams: { pause: [listView] } });
    await openListView();
    await advance(10_000);
    const before = storedRemaining();
    expect(before).toBe(80);
    act(() => ctx!.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "rest", itemIndex: 0, setIndex: 0 });
    expect(storedRemaining()).toBe(before);
    expect(session().rest).toEqual({ remainingS: 80 });
  });

  const WITH_BACKOFF: SessionPlan = {
    ...P1,
    items: [{ ...BENCH, backoff: { weightKg: 70, reps: 6 } }, PLANK],
  };
  const allButBackoff = [
    ...[0, 1, 2, 3].map((i) => logged(0, i, WITH_BACKOFF)),
    ...[0, 1].map((i) => logged(1, i, WITH_BACKOFF)),
  ];

  // Bench set 3 on UF-09.4 (confirm), and both plank sets already logged from List view.
  const seedBeforeBackoff = () =>
    seedFocus(
      {
        phase: "paused",
        resumePhase: "confirm",
        pausedAtMs: NOW,
        itemIndex: 0,
        setIndex: 3,
        loggedSets: allButBackoff,
      },
      WITH_BACKOFF,
    );

  it("every planned set logged, the back-off included → done, which finishes", async () => {
    await seedSession({ plan: WITH_BACKOFF });
    seedBeforeBackoff();
    await renderSession({ seams: { pause: [listView] } });
    const c = await openListView();
    // Not the current set (bench 3 is on screen): an out-of-order log, nothing moves yet.
    await call(() =>
      c.recordSet({
        sessionId: S1,
        itemIndex: 0,
        exerciseId: "bench-press",
        setIndex: 4,
        kind: "reps",
        reps: 6,
        weightKg: 70,
        isWarmup: false,
        backoff: true,
      }),
    );
    expect(storedFocus()).toMatchObject({ phase: "confirm", setIndex: 3 });
    expect(currentLocation.pathname).toBe(`/session/${S1}`);
    act(() => c.close());
    await flushReal();
    await flushReal();
    expect(currentLocation.pathname).toBe(`/session/${S1}/summary`);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("the pair: the back-off not logged → set for bench-press setIndex 4 (the back-off)", async () => {
    await seedSession({ plan: WITH_BACKOFF });
    seedBeforeBackoff();
    await renderSession({ seams: { pause: [listView] } });
    const c = await openListView();
    act(() => c.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 0, setIndex: 4 });
    expect(currentLocation.pathname).toBe(`/session/${S1}`);
  });
});
