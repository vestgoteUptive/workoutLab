// T-0304e AC-9 (D-0071 §4): the empty registries, the pure v2 `orderActions`, injection through
// the `seams` prop, overlays in place of the screen, and PAUSE / RESUME / the forced check point
// per `keepsClockRunning`.
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import { nextSeamActions, orderActions, pauseSeamActions, type SeamAction } from "../seams.js";
import type { FocusSession } from "../session.js";
import type { ResolveCheckPoint } from "../store.js";
import { remainingS, type FocusTimer } from "../timer.js";
import { P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  screenIds,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, renderSession } from "./session-helpers.js";
import { countOf, dispatched, lastStore, stores } from "./store-spy.js";

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

let ctx: FocusSession | null = null;
function entry(id: string, label: string, keepsClockRunning: boolean): SeamAction {
  return {
    id,
    label,
    keepsClockRunning,
    render: (c) => {
      ctx = c;
      return <p data-testid={`overlay-${id}`}>{label}</p>;
    },
  };
}
const swap = entry("swap", "Swap", false);
const howTo = entry("how-to", "How to", false);
const listView = entry("list-view", "List view", true);

function buttonNames(): string[] {
  return screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent!);
}

const benchLogged: LoggedSet[] = [0, 1, 2, 3].map((setIndex) => ({
  clientId: `b${setIndex}`,
  itemIndex: 0,
  setIndex,
  exerciseId: "bench-press",
  reps: 6,
  weightKg: 80,
  durationS: null,
  rir: null,
  backoff: false,
}));

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  ctx = null;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// D-0142 §6 (a named change, T-0422, then T-0416): the arrays hold exactly the ids landed so far.
describe("AC-9 the module registries", () => {
  it("pauseSeamActions holds swap, how-to, list-view; nextSeamActions holds swap (T-0416)", () => {
    expect(pauseSeamActions.map((s) => s.id)).toEqual(["swap", "how-to", "list-view"]);
    expect(nextSeamActions.map((s) => s.id)).toEqual(["swap"]);
    // T-0416 AC-1: how-to holds the workout paused, list-view keeps the clocks running.
    const flag = (id: string) => pauseSeamActions.find((s) => s.id === id)?.keepsClockRunning;
    expect(flag("how-to")).toBe(false);
    expect(flag("list-view")).toBe(true);
  });

  // T-0304f (D-0118 §12): the built UF-09.6 adds its own "I'm ready" before any seam.
  it("UF-09.6 with the module arrays: Pause, I'm ready and the swap seam", async () => {
    seedFocus({ phase: "next", timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } });
    await renderSession();
    expect(screenId()).toBe("UF-09.6");
    expect(buttonNames()).toEqual(["Pause workout", "I'm ready", "Swap"]);
    expect(
      Array.from(document.querySelectorAll("[data-seam-id]")).map((b) =>
        b.getAttribute("data-seam-id"),
      ),
    ).toEqual(["swap"]);
  });

  // T-0304d (D-0118 §12): the built UF-09.9 adds its own Skip to next exercise and End workout.
  it("UF-09.9 with the module arrays: the built-in actions and the three seams", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession();
    expect(screenId()).toBe("UF-09.9");
    expect(buttonNames()).toEqual([
      "Resume",
      "Swap",
      "Skip to next exercise",
      "How to",
      "List view",
      "End workout",
    ]);
    expect(
      Array.from(document.querySelectorAll("[data-seam-id]")).map((b) =>
        b.getAttribute("data-seam-id"),
      ),
    ).toEqual(["swap", "how-to", "list-view"]);
  });
});

describe("AC-9 orderActions (pure)", () => {
  it("pause: the v2 order, the unknown id dropped", () => {
    expect(
      orderActions(
        ["resume", "skip", "end"],
        [{ id: "list-view" }, { id: "swap" }, { id: "how-to" }, { id: "bogus" }],
        "pause",
      ),
    ).toEqual(["resume", "swap", "skip", "how-to", "list-view", "end"]);
  });

  it("next: I'm ready · swap", () => {
    expect(orderActions(["ready"], [{ id: "swap" }], "next")).toEqual(["ready", "swap"]);
  });

  it("an unknown id is dropped, and a pause-only id has no place on next", () => {
    expect(orderActions([], [{ id: "bogus" }], "pause")).toEqual([]);
    expect(orderActions(["ready"], [{ id: "how-to" }, { id: "bogus" }], "next")).toEqual(["ready"]);
  });

  it("doesn't mutate its inputs", () => {
    const builtIns = ["end", "resume"];
    const seams = [{ id: "swap" }];
    orderActions(builtIns, seams, "pause");
    expect(builtIns).toEqual(["end", "resume"]);
    expect(seams).toEqual([{ id: "swap" }]);
  });
});

describe("AC-9 injection", () => {
  // T-0304d (D-0118 §12): with the built-ins in their v2 places (D-0120 §6).
  it("UF-09.9 renders Resume · Swap · Skip · How to · List view · End in that order", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams: { pause: [listView, howTo, swap] } });
    expect(buttonNames()).toEqual([
      "Resume",
      "Swap",
      "Skip to next exercise",
      "How to",
      "List view",
      "End workout",
    ]);
  });

  it("UF-09.6 renders the Swap entry", async () => {
    seedFocus({ phase: "next", timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } });
    await renderSession({ seams: { next: [swap] } });
    expect(buttonNames()).toEqual(["Pause workout", "I'm ready", "Swap"]);
  });

  it("a screen other than UF-09.6/.9 renders no seam entry", async () => {
    seedFocus({ phase: "set" });
    await renderSession({ seams: { pause: [swap], next: [swap] } });
    expect(screenId()).toBe("UF-09.3");
    // T-0304b (D-0118 §12): the built UF-09.3 adds its own Done set, and still no seam entry.
    expect(buttonNames()).toEqual(["Pause workout", "Done set"]);
    expect(document.querySelector("[data-seam-id]")).toBeNull();
  });
});

describe("AC-9 overlay in place of the screen", () => {
  it("renders render(ctx) only: no [data-screen-id], no pause button, the overlay is the one task", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams: { pause: [swap] } });
    const hookKeys = Object.keys(session()).sort();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await flushReal();
    expect(screenIds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Pause workout" })).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByTestId("overlay-swap")).toBeTruthy();

    const keys = Object.keys(ctx!).sort();
    expect(keys).toEqual(hookKeys);
    expect(keys).toEqual(
      [
        "sessionId",
        "timeZone",
        "row",
        "plan",
        "workout",
        "state",
        "currentItemIndex",
        "currentSetIndex",
        "loggedSets",
        "rest",
        "elapsedS",
        "recordSet",
        "editSet",
        "deleteSet",
        "replaceItem",
        "finish",
        "startRest",
        "adjustRest",
        "skipRest",
        "resume",
        "close",
      ].sort(),
    );
    expect(typeof ctx!.close).toBe("function");
  });
});

describe("AC-9 keepsClockRunning", () => {
  it("false from UF-09.6: PAUSE, so the 60 s countdown is unchanged after 30 s; close() → RESUME → UF-09.6", async () => {
    seedFocus({ phase: "next", timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } });
    await renderSession({ seams: { next: [swap] } });
    expect(timerText()).toBe("1:00");
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await flushReal();
    expect(countOf("PAUSE")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "next" });
    await advance(30_000);
    expect(countOf("READY")).toBe(0);
    act(() => ctx!.close());
    await flushReal();
    expect(countOf("RESUME")).toBe(1);
    expect(screenId()).toBe("UF-09.6");
    expect(timerText()).toBe("1:00");
  });

  it("the pair, with no overlay: the UF-09.6 countdown runs (0:30 after 30 s)", async () => {
    seedFocus({ phase: "next", timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } });
    await renderSession({ seams: { next: [swap] } });
    await advance(30_000);
    expect(timerText()).toBe("0:30");
  });

  it("false from UF-09.9: stays paused; close() returns to paused", async () => {
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession({ seams: { pause: [howTo] } });
    fireEvent.click(screen.getByRole("button", { name: "How to" }));
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "paused" });
    act(() => ctx!.close());
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    expect(countOf("PAUSE")).toBe(0);
    expect(countOf("RESUME")).toBe(0);
  });

  it("true from paused: RESUME, the rest keeps counting, the check point is forced to next; after close() it is called", async () => {
    const resolveCheckPoint = vi.fn<ResolveCheckPoint>(() => "next");
    seedFocus({
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      setIndex: 3,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      loggedSets: benchLogged,
    });
    await renderSession({ seams: { pause: [listView] }, resolveCheckPoint });
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await flushReal();
    expect(countOf("RESUME")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "rest" });
    await advance(30_000);
    expect(remainingS(storedFocus()!.timer as FocusTimer, Date.now())).toBe(90);
    expect(screen.getByTestId("overlay-list-view")).toBeTruthy();

    // The last bench rest ends under the overlay: the check point resolves to next, unasked.
    await advance(90_000);
    expect(countOf("REST_END")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1, setIndex: 0 });
    expect(resolveCheckPoint).toHaveBeenCalledTimes(0);

    act(() => ctx!.close());
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
    act(() => lastStore().dispatch({ type: "READY", atMs: Date.now() }));
    for (const setIndex of [0, 1, 2]) {
      await call(() =>
        session().recordSet({
          sessionId: S1,
          itemIndex: 1,
          exerciseId: "barbell-row",
          setIndex,
          kind: "reps",
          reps: 8,
          weightKg: 60,
          isWarmup: false,
          backoff: false,
        }),
      );
      act(() => lastStore().dispatch({ type: "SAVED", atMs: Date.now() }));
      act(() => session().skipRest());
    }
    expect(resolveCheckPoint).toHaveBeenCalledTimes(1);
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 2 });
  });

  it("the pair: with no overlay open, the check point calls resolveCheckPoint", async () => {
    const resolveCheckPoint = vi.fn<ResolveCheckPoint>(() => "next");
    seedFocus({
      phase: "rest",
      setIndex: 3,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      loggedSets: benchLogged,
    });
    await renderSession({ seams: { pause: [listView] }, resolveCheckPoint });
    await advance(120_000);
    expect(resolveCheckPoint).toHaveBeenCalledTimes(1);
  });
});
