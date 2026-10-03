// T-0415 (D-0142 §2, D-0153 §1 §3): the real SessionHost with an injected List view seam
// (`keepsClockRunning: true`). A `source: "list"` log never moves the machine, `done` waits under
// the overlay, and entering an item starts at its first free set. P1, fake-indexeddb.
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import { readFocusState } from "../persist.js";
import type { SeamAction } from "../seams.js";
import type { FocusSession } from "../session.js";
import { P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenIds,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { call, currentLocation, renderSession } from "./session-helpers.js";
import { findPath, findScreen, doneButton, setLineText } from "./set-loop-helpers.js";
import { countOf, dispatched, stores } from "./store-spy.js";
import { LIB, logged } from "./t0414-fixtures.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const KEY = `wl-focus:${S1}`;
const upsertSpy = vi.mocked(offline.upsertSession);
const recordSpy = vi.mocked(offline.recordSet);

let ctx: FocusSession | null = null;
const entry = (id: string, label: string, keepsClockRunning: boolean): SeamAction => ({
  id,
  label,
  keepsClockRunning,
  render: (c) => {
    ctx = c;
    return <p data-testid={`overlay-${id}`}>{label}</p>;
  },
});
const listView = entry("list-view", "List view", true);
const howTo = entry("how-to", "How to", false);
const seams = { pause: [listView, howTo] };

function seedFocus(state: Partial<FocusState>): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, P1, NOW), timer: null, ...state }),
  );
}
const timer = { startedAtMs: NOW, durationS: 60, pausedMs: 0 };
const bench4: LoggedSet[] = [0, 1, 2, 3].map((i) => logged(0, i));
const item = (n: number, count: number): LoggedSet[] =>
  Array.from({ length: count }, (_, i) => logged(n, i));
const endedWrites = () => upsertSpy.mock.calls.filter(([row]) => row.ended_at != null);

const benchInput = (setIndex: number) => ({
  sessionId: S1,
  exerciseId: "bench-press",
  setIndex,
  kind: "reps" as const,
  reps: 8,
  weightKg: 60,
  isWarmup: false,
  backoff: false,
  itemIndex: 0,
});
const plankInput = (setIndex: number) => ({
  sessionId: S1,
  exerciseId: "plank",
  setIndex,
  kind: "timed" as const,
  durationS: 45,
  isWarmup: false,
  backoff: false,
  itemIndex: 3,
});

async function openList(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "List view" }));
  await flushReal();
}

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  ctx = null;
  currentLocation.pathname = "";
  upsertSpy.mockClear();
  recordSpy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("T-0415 AC-1 a List-view set never moves the machine", () => {
  async function onBench() {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams });
    await openList();
    expect(storedFocus()).toMatchObject({ phase: "set" });
  }

  it("reps: source list keeps phase set, setIndex 0, no timer; 6 s later still set, no SAVED", async () => {
    await onBench();
    await call(() => ctx!.recordSet({ ...benchInput(0), source: "list" }));
    const s = storedFocus() as unknown as FocusState;
    expect(s).toMatchObject({ phase: "set", setIndex: 0, timer: null });
    expect(s.loggedSets).toHaveLength(1);
    expect(s.loggedSets[0]).toMatchObject({ setIndex: 0 });
    await advance(6000);
    expect(storedFocus()).toMatchObject({ phase: "set" });
    expect(countOf("SAVED")).toBe(0);
    expect(countOf("SET_RECORDED")).toBe(0);
  });

  it("pair: no source gives confirm with the 5 s auto-save timer", async () => {
    await onBench();
    await call(() => ctx!.recordSet(benchInput(0)));
    expect(storedFocus()).toMatchObject({ phase: "confirm", timer: { durationS: 5 } });
  });

  it.each([
    ["list", "timed"],
    [undefined, "rest"],
  ] as const)("timed: source %s gives phase %s", async (source, phase) => {
    seedFocus({
      phase: "paused",
      resumePhase: "timed",
      pausedAtMs: NOW,
      itemIndex: 3,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: 45, pausedMs: 0 },
      loggedSets: [...bench4, ...item(1, 3), ...item(2, 3)],
    });
    await renderSession({ seams });
    await openList();
    await call(() => ctx!.recordSet(source ? { ...plankInput(0), source } : plankInput(0)));
    expect(storedFocus()).toMatchObject({ phase });
  });

  it("close re-syncs: after list logs of sets 0 and 1, UF-09.3 shows Set 3 of 4", async () => {
    await onBench();
    await call(() => ctx!.recordSet({ ...benchInput(0), source: "list" }));
    await call(() => ctx!.recordSet({ ...benchInput(1), source: "list" }));
    act(() => ctx!.close());
    await flushReal();
    expect(screenIds()).toEqual(["UF-09.3"]);
    expect(setLineText()).toBe("Set 3 of 4");
  });
});

describe("T-0415 AC-3 done waits under a List-view overlay", () => {
  const seedPlank = () =>
    seedFocus({
      phase: "paused",
      resumePhase: "timed",
      pausedAtMs: NOW,
      itemIndex: 3,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: 45, pausedMs: 0 },
      loggedSets: [...bench4, ...item(1, 3), ...item(2, 3)],
    });

  async function toDoneUnderList(): Promise<void> {
    seedPlank();
    await renderSession({ seams });
    await openList();
    await call(() => ctx!.recordSet({ ...plankInput(0), source: "list" }));
    await call(() => ctx!.recordSet({ ...plankInput(1), source: "list" }));
    act(() => ctx!.startRest("plank"));
    await advance(200_000);
  }

  it("the rest runs out: state done, overlay stays, no ended_at write, key kept, route kept", async () => {
    await toDoneUnderList();
    expect(storedFocus()).toMatchObject({ phase: "done" });
    expect(screen.getByTestId("overlay-list-view")).toBeTruthy();
    expect(screenIds()).toEqual([]);
    await flushReal();
    expect(endedWrites()).toHaveLength(0);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(currentLocation.pathname).toBe(`/session/${S1}`);
  });

  it("then close: exactly one finish write, key removed, summary; no second write later", async () => {
    await toDoneUnderList();
    act(() => ctx!.close());
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(endedWrites()).toHaveLength(1);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await flushReal();
    expect(endedWrites()).toHaveLength(1);
  });

  it("or finish() from the overlay: one write and navigation; a second call while pending adds none", async () => {
    await toDoneUnderList();
    await call(async () => {
      const a = ctx!.finish();
      const b = ctx!.finish();
      await Promise.all([a, b]);
    });
    await findPath(`/session/${S1}/summary`);
    expect(endedWrites()).toHaveLength(1);
  });

  it("the pair: with no overlay, done finishes at once", async () => {
    seedFocus({
      phase: "rest",
      itemIndex: 3,
      setIndex: 1,
      timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 },
      loggedSets: [...bench4, ...item(1, 3), ...item(2, 3), ...item(3, 2)],
    });
    await renderSession({ seams });
    await advance(61_000);
    await findPath(`/session/${S1}/summary`);
    expect(endedWrites()).toHaveLength(1);
  });

  it("a keepsClockRunning:false overlay keeps the machine paused for 10 min", async () => {
    seedPlank();
    await renderSession({ seams });
    fireEvent.click(screen.getByRole("button", { name: "How to" }));
    await flushReal();
    await advance(600_000);
    expect(storedFocus()).toMatchObject({ phase: "paused" });
    expect(screen.getByTestId("overlay-how-to")).toBeTruthy();
  });
});

describe("T-0415 AC-4 reload", () => {
  it("after a list log the stored state is restored as it was", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams });
    await openList();
    await call(() => ctx!.recordSet({ ...benchInput(0), source: "list" }));
    const before = storedFocus();
    cleanup();
    await renderSession({ seams });
    expect(storedFocus()).toEqual(before);
    expect(storedFocus()).toMatchObject({ phase: "set", setIndex: 0 });
    expect(screenIds()).toEqual(["UF-09.3"]);
  });

  it("a stored done (overlay not restored) finishes once", async () => {
    seedFocus({
      phase: "done",
      itemIndex: 3,
      setIndex: 1,
      loggedSets: [...bench4, ...item(1, 3), ...item(2, 3), ...item(3, 2)],
    });
    await renderSession({ seams });
    await findPath(`/session/${S1}/summary`);
    await flushReal();
    expect(endedWrites()).toHaveLength(1);
  });

  it("persist accepts a valid state and rejects an out-of-range one", () => {
    const base = { ...initialFocusState(S1, P1, NOW), timer: null, phase: "set" as const };
    const c = { plan: P1, library: LIB };
    const good = { ...base, setIndex: 1, loggedSets: [logged(0, 0)] };
    const store = (s: unknown) => {
      const m = new Map([[KEY, JSON.stringify(s)]]);
      return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
      } as unknown as Storage;
    };
    expect(readFocusState(S1, c, store(good))).not.toBeNull();
    expect(readFocusState(S1, c, store({ ...good, setIndex: 99 }))).toBeNull();
  });
});

describe("T-0415 AC-5 host: entering an item at its first free set", () => {
  it("a list log of row set 0 during UF-09.6, then the set-up runs out and close: Set 2 of 3, Done records setIndex 1", async () => {
    seedFocus({
      phase: "paused",
      resumePhase: "next",
      pausedAtMs: NOW,
      itemIndex: 1,
      setIndex: 0,
      timer,
      loggedSets: bench4,
    });
    await renderSession({ seams });
    await openList();
    await call(() =>
      ctx!.recordSet({
        sessionId: S1,
        itemIndex: 1,
        exerciseId: "barbell-row",
        setIndex: 0,
        kind: "reps",
        reps: 8,
        weightKg: 60,
        isWarmup: false,
        backoff: false,
        source: "list",
      }),
    );
    await advance(61_000);
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 1, setIndex: 1 });
    act(() => ctx!.close());
    await findScreen("UF-09.3");
    expect(setLineText()).toBe("Set 2 of 3");
    fireEvent.click(doneButton());
    await flushReal();
    const calls = recordSpy.mock.calls.map(([i]) => i).filter((i) => i.itemIndex === 1);
    expect(calls.map((i) => i.setIndex)).toEqual([0, 1]);
    const s = storedFocus() as unknown as FocusState;
    const keys = s.loggedSets.map((l) => `${l.itemIndex}:${l.setIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
