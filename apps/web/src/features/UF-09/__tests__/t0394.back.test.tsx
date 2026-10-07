// T-0394 (D-0123 §3, D-0162 §1): Back means Pause. The real SessionHost under a real
// BrowserRouter over jsdom's window.history; history = ["/", "/session/setup", "/session/S1"].
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import type { FocusState } from "../machine.js";
import type { SeamAction } from "../seams.js";
import { SessionHost, type SessionHostProps } from "../host.js";
import { STARTED_AT_MS, USER_A, behindStartedAt } from "./fixtures.js";
import {
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
  advance,
} from "./helpers.js";
import { L2, defaultDetail } from "./set-loop-fixtures.js";
import { seedFocus } from "./set-loop-helpers.js";
import { countOf, dispatched, lastStore, stores } from "./store-spy.js";
import { logged } from "./t0414-fixtures.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./set-loop-mock.js").then((m) => m.setLoopMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 10 * 60_000;
const running = (durationS: number) => ({ startedAtMs: NOW, durationS, pausedMs: 0 });
const guard = () => (window.history.state as { wlFocusGuard?: boolean } | null)?.wlFocusGuard;

let navTypeAtSummary: string | null = null;
let atPath = "";
function Probe() {
  atPath = useLocation().pathname;
  return null;
}
function Summary() {
  navTypeAtSummary = useNavigationType();
  return <span data-screen-id="UF-03.3" />;
}

function mount(props: SessionHostProps = {}) {
  return render(
    <BrowserRouter>
      <Probe />
      <Routes>
        <Route path="/session/:sessionId" element={<SessionHost locale="en-GB" {...props} />} />
        <Route path="/session/:sessionId/summary" element={<Summary />} />
        <Route path="/session/setup" element={<span data-testid="setup" />} />
        <Route path="/" element={<span data-testid="home" />} />
      </Routes>
    </BrowserRouter>,
  );
}
async function renderAt(props: SessionHostProps = {}) {
  const view = mount(props);
  await flushReal();
  return view;
}
async function back(): Promise<void> {
  await act(async () => {
    const popped = new Promise<void>((r) =>
      window.addEventListener("popstate", () => r(), { once: true }),
    );
    window.history.back();
    // jsdom runs the traversal on a (faked) zero-delay timer.
    vi.advanceTimersByTime(50);
    await popped;
  });
  await flushReal();
  // A second traversal the host asked for from the popstate handler (paused Back leaves).
  act(() => {
    vi.advanceTimersByTime(50);
  });
  await flushReal();
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const rest90: Partial<FocusState> = {
  phase: "rest",
  timer: running(90),
  loggedSets: [logged(0, 0)],
};

const SEEDS: [string, Partial<FocusState>, string][] = [
  ["UF-09.1", { phase: "getReady", timer: running(5) }, "UF-09.1"],
  ["UF-09.3", { phase: "set" }, "UF-09.3"],
  ["UF-09.5", rest90, "UF-09.5"],
  ["UF-09.6", { phase: "next", itemIndex: 1, timer: running(60) }, "UF-09.6"],
  ["UF-09.8", { phase: "timeCheck", itemIndex: 1 }, "UF-09.8"],
];

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  navTypeAtSummary = null;
  vi.mocked(offline.loadLibrary).mockImplementation(async () => L2);
  vi.mocked(offline.loadExerciseDetail).mockImplementation(defaultDetail);
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession({ started_at: behindStartedAt(NOW) });
  window.history.pushState(null, "", "/");
  window.history.pushState(null, "", "/session/setup");
  window.history.pushState(null, "", "/session/S1");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("T-0394 AC-1 the guard is armed", () => {
  it("a machine state pushes exactly one guard entry with the same URL", async () => {
    seedFocus(NOW, { phase: "getReady", timer: running(5) });
    const before = window.history.length;
    await renderAt();
    expect(screenId()).toBe("UF-09.1");
    expect(window.history.length).toBe(before + 1);
    expect(guard()).toBe(true);
    expect(window.location.pathname).toBe("/session/S1");
  });

  it("once: three transitions push nothing more", async () => {
    seedFocus(NOW, { phase: "getReady", timer: running(5) });
    await renderAt();
    const len = window.history.length;
    act(() => lastStore().dispatch({ type: "SKIP_WARMUP", atMs: NOW }));
    expect(screenId()).toBe("UF-09.3");
    act(() => lastStore().dispatch({ type: "SET_RECORDED", set: logged(0, 0), atMs: NOW }));
    expect(screenId()).toBe("UF-09.4");
    act(() => lastStore().dispatch({ type: "SAVED", atMs: NOW }));
    expect(screenId()).toBe("UF-09.5");
    await flushReal();
    expect(window.history.length).toBe(len);
  });

  it.each([
    ["not on this device", async () => {}, "UF-09", /isn't on this device/],
    [
      "ended",
      async () => seedSession({ ended_at: "2026-09-27T11:00:00.000Z" }),
      "UF-09",
      /has ended/,
    ],
    [
      "stale",
      async () => seedSession({ started_at: new Date(NOW - 20 * 3600_000).toISOString() }),
      "UF-09",
      /was started on/,
    ],
  ])("host-level %s: no guard", async (name, setup, id, title) => {
    if (name === "not on this device") window.history.replaceState(null, "", "/session/NOPE");
    else {
      window.localStorage.removeItem("wl-focus:S1");
      await setup();
    }
    const len = window.history.length;
    await renderAt();
    await flushReal();
    expect(screenId()).toBe(id);
    // Only this state's own title passes (T-0462 AC-4): the three share one screen id.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(title);
    expect(window.history.length).toBe(len);
    expect(guard()).not.toBe(true);
  });

  it("loading: no guard before the load settles", async () => {
    const len = window.history.length;
    mount();
    expect(screenId()).toBe("UF-09");
    expect(window.history.length).toBe(len);
    expect(guard()).not.toBe(true);
    await flushReal();
  });
});

describe("T-0394 AC-2 Back in a running state means Pause", () => {
  it.each(SEEDS)("%s: Back shows UF-09.9, stays, re-arms", async (_n, seed) => {
    seedFocus(NOW, seed);
    await renderAt();
    await back();
    expect(screenId()).toBe("UF-09.9");
    expect(atPath).toBe("/session/S1");
    expect(guard()).toBe(true);
    expect(countOf("PAUSE")).toBe(1);
  });

  it("same as the button: the stored state matches Pause workout", async () => {
    seedFocus(NOW, rest90);
    await renderAt();
    await back();
    const byBack = storedFocus();
    cleanup();
    window.localStorage.removeItem("wl-focus:S1");
    seedFocus(NOW, rest90);
    await renderAt();
    click("Pause workout");
    await flushReal();
    expect(byBack).toMatchObject({ phase: "paused", resumePhase: "rest" });
    expect(byBack!.pausedAtMs).toEqual(expect.any(Number));
    // Apart from the `atMs`-derived fields: the 1 ms jsdom traversal takes.
    const { pausedAtMs: _a, ...rest } = byBack!;
    const { pausedAtMs: _b, ...restBtn } = storedFocus()!;
    expect(restBtn).toEqual(rest);
  });

  it("the rest timer stops: 90 s left, 60 s paused, Resume shows 1:30", async () => {
    seedFocus(NOW, rest90);
    await renderAt();
    expect(timerText()).toBe("1:30");
    await back();
    await advance(60_000);
    click("Resume");
    await flushReal();
    expect(timerText()).toBe("1:30");
  });
});

describe("T-0394 AC-3 Back while paused leaves", () => {
  it("from Pause workout: Back leaves, the focus key stays", async () => {
    seedFocus(NOW, { phase: "set" });
    await renderAt();
    click("Pause workout");
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    await back();
    expect(atPath).toBe("/session/setup");
    expect(storedFocus()).not.toBeNull();
    expect(countOf("PAUSE")).toBe(1);
  });

  it("the pair: from UF-09.9 reached by a Back, one more Back leaves, no new pause or guard", async () => {
    seedFocus(NOW, { phase: "set" });
    await renderAt();
    await back();
    expect(screenId()).toBe("UF-09.9");
    const len = window.history.length;
    await back();
    expect(atPath).toBe("/session/setup");
    expect(countOf("PAUSE")).toBe(1);
    expect(window.history.length).toBe(len);
    expect(guard()).not.toBe(true);
    expect(storedFocus()).toMatchObject({ phase: "paused" });
  });
});

describe("T-0394 AC-4 a seam overlay", () => {
  let ctx: { close(): void } | null = null;
  // The ids are the ones the v2 order knows (`orderActions`); the labels are the test's names.
  const entry = (id: string, label: string, keepsClockRunning: boolean): SeamAction => ({
    id,
    label,
    keepsClockRunning,
    render: (c) => {
      ctx = c;
      return <p data-testid={`overlay-${label}`}>{label}</p>;
    },
  });
  const seams = {
    pause: [entry("list-view", "keeps", true), entry("how-to", "holds", false)],
    next: [entry("swap", "holds-next", false)],
  };

  it("false from UF-09.9: Back closes to UF-09.9, same resumePhase, re-armed; a second Back leaves", async () => {
    seedFocus(NOW, { phase: "paused", resumePhase: "rest", pausedAtMs: NOW, timer: running(90) });
    await renderAt({ seams });
    click("holds");
    await flushReal();
    expect(screen.getByTestId("overlay-holds")).toBeTruthy();
    await back();
    expect(screen.queryByTestId("overlay-holds")).toBeNull();
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "rest" });
    expect(countOf("RESUME")).toBe(0);
    expect(guard()).toBe(true);
    await back();
    expect(atPath).toBe("/session/setup");
  });

  it("false from UF-09.6: Back gives UF-09.9 with resumePhase next; the pair: its own close resumes UF-09.6", async () => {
    seedFocus(NOW, { phase: "next", itemIndex: 1, timer: running(60) });
    await renderAt({ seams });
    click("holds-next");
    await flushReal();
    await back();
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "next" });
    cleanup();
    window.localStorage.removeItem("wl-focus:S1");
    seedFocus(NOW, { phase: "next", itemIndex: 1, timer: running(60) });
    await renderAt({ seams });
    click("holds-next");
    await flushReal();
    act(() => ctx!.close());
    await flushReal();
    expect(screenId()).toBe("UF-09.6");
  });

  it("true from UF-09.9: Back gives paused/set, clears the forced check point, re-arms; the pair: ctx.close shows UF-09.3", async () => {
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderAt({ seams });
    click("keeps");
    await flushReal();
    expect(storedFocus()).toMatchObject({ phase: "set" });
    await back();
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toMatchObject({ phase: "paused", resumePhase: "set" });
    expect(guard()).toBe(true);
    // The forced check point is cleared: a resume then a set's end asks the check point again.
    click("Resume");
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
    cleanup();
    window.localStorage.removeItem("wl-focus:S1");
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderAt({ seams });
    click("keeps");
    await flushReal();
    act(() => ctx!.close());
    await flushReal();
    expect(screenId()).toBe("UF-09.3");
  });
});

describe("T-0394 AC-5 leaving by the app's own navigation", () => {
  it("End replaces the guard entry: length unchanged, summary navigation type REPLACE", async () => {
    seedFocus(NOW, { phase: "set" });
    await renderAt();
    click("Pause workout");
    await flushReal();
    click("End workout");
    await flushReal();
    const len = window.history.length;
    click("End workout");
    await flushReal();
    expect(atPath).toBe("/session/S1/summary");
    expect(navTypeAtSummary).toBe("REPLACE");
    expect(window.history.length).toBe(len);
  });

  it("unmount: the listener is removed and a popstate dispatches nothing", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const add = vi.spyOn(window, "addEventListener");
    seedFocus(NOW, { phase: "set" });
    const view = await renderAt();
    const handler = add.mock.calls.find(([t]) => t === "popstate")![1];
    view.unmount();
    expect(remove).toHaveBeenCalledWith("popstate", handler);
    dispatched.length = 0;
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flushReal();
    expect(dispatched).toHaveLength(0);
  });
});
