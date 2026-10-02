// T-0304a AC-9 (D-0111 §5 §8): the host fires each phase's end event exactly once when its
// wall-clock timer reaches 0; `timed` ends by its auto-log (T-0304c); `betweenItems` is resolved inside the store.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialFocusState, type FocusState, type LoggedSet } from "../machine.js";
import type { ResolveCheckPoint } from "../store.js";
import { P1, S1, STARTED_AT_MS, USER_A, behindStartedAt } from "./fixtures.js";
import {
  advance,
  freshDb,
  renderLoaded,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  timerText,
  useFakeClock,
} from "./helpers.js";
import { countOf, dispatched } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-mock.js").then((m) => m.offlineMock(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));

const NOW = STARTED_AT_MS + 5 * 60_000;
const KEY = `wl-focus:${S1}`;

beforeEach(async () => {
  window.localStorage.clear();
  dispatched.length = 0;
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Bench sets 0…n−1 logged. A seeded rest holds the set it follows, as the real flow does: since
 *  T-0304e a rest leads to the first unlogged set from `setIndex` on (D-0071 §5). */
function benchLogged(n: number): LoggedSet[] {
  return Array.from({ length: n }, (_, setIndex) => ({
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
}

function seed(state: Partial<FocusState>): void {
  window.localStorage.setItem(KEY, JSON.stringify({ ...initialFocusState(S1, P1, NOW), ...state }));
}

describe("AC-9 auto-advance", () => {
  it("getReady: still showing at 4 999 ms, warmup move 0 at 5 s, with one COUNTDOWN_END", async () => {
    await renderLoaded();
    expect(screenId()).toBe("UF-09.1");
    await advance(4999);
    expect(screenId()).toBe("UF-09.1");
    // T-0304f: the built UF-09.1 counts bare seconds, 5 → 1 (parent AC-B1).
    expect(timerText()).toBe("1");
    expect(countOf("COUNTDOWN_END")).toBe(0);
    await advance(1);
    expect(screenId()).toBe("UF-09.2");
    expect(storedFocus()).toMatchObject({ phase: "warmup", warmupIndex: 0 });
    expect(countOf("COUNTDOWN_END")).toBe(1);
    expect(timerText()).toBe("0:40");
  });

  it("warmup at 40 s → the next move (one WARMUP_NEXT, not two)", async () => {
    seed({
      phase: "warmup",
      warmupIndex: 0,
      warmupStartedAtMs: NOW,
      timer: { startedAtMs: NOW, durationS: 40, pausedMs: 0 },
    });
    await renderLoaded();
    await advance(39_999);
    expect(storedFocus()).toMatchObject({ phase: "warmup", warmupIndex: 0 });
    await advance(1);
    expect(storedFocus()).toMatchObject({ phase: "warmup", warmupIndex: 1 });
    expect(countOf("WARMUP_NEXT")).toBe(1);
    expect(timerText()).toBe("0:40");
    await advance(2000);
    expect(countOf("WARMUP_NEXT")).toBe(1);
    expect(storedFocus()).toMatchObject({ warmupIndex: 1 });
  });

  it("rest at 120 s → set (one REST_END)", async () => {
    seed({
      phase: "rest",
      itemIndex: 0,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      loggedSets: benchLogged(1),
    });
    await renderLoaded();
    await advance(119_000);
    expect(screenId()).toBe("UF-09.5");
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toMatchObject({ phase: "set", setIndex: 1 });
    expect(countOf("REST_END")).toBe(1);
    await advance(5000);
    expect(countOf("REST_END")).toBe(1);
  });

  it("next at 60 s → set (one READY)", async () => {
    seed({ phase: "next", itemIndex: 1, timer: { startedAtMs: NOW, durationS: 60, pausedMs: 0 } });
    await renderLoaded();
    await advance(59_000);
    expect(screenId()).toBe("UF-09.6");
    await advance(1000);
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toMatchObject({ phase: "set", itemIndex: 1, setIndex: 0 });
    expect(countOf("READY")).toBe(1);
  });

  it("the wall clock moving back after the exact timeout is scheduled: rest still ends, once", async () => {
    seed({
      phase: "rest",
      itemIndex: 0,
      setIndex: 0,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
      loggedSets: benchLogged(1),
    });
    await renderLoaded();
    expect(screenId()).toBe("UF-09.5");
    // The exact timeout is now scheduled for NOW + 120 s. Move the wall clock back 10 s (NTP or a
    // manual change): when that timeout fires, the timer still reads 0:10.
    vi.setSystemTime(Date.now() - 10_000);
    await advance(120_000);
    expect(screenId()).toBe("UF-09.5");
    expect(timerText()).toBe("0:10");
    expect(countOf("REST_END")).toBe(0);
    await advance(10_000);
    expect(screenId()).toBe("UF-09.3");
    expect(countOf("REST_END")).toBe(1);
    await advance(30_000);
    expect(countOf("REST_END")).toBe(1);
    expect(storedFocus()).toMatchObject({ phase: "set", setIndex: 1 });
  });

  it("a paused rest doesn't expire (the pair of the rest case)", async () => {
    seed({
      phase: "paused",
      resumePhase: "rest",
      pausedAtMs: NOW,
      timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
    });
    await renderLoaded();
    await advance(600_000);
    expect(screenId()).toBe("UF-09.9");
    expect(dispatched).toEqual([]);
  });
});

// T-0304c (D-0119 §3, the D-0111 §8 hand-off): T-0304a's "timed doesn't advance after 600 s" is
// replaced by the auto-log. `timed` still has no end event of its own; at 0 the host logs the
// hold once through the hook, which dispatches the one TIMED_RECORDED after the write.
describe("AC-9 timed ends by its auto-log (T-0304c)", () => {
  it("timed: after 600 s, no end event, exactly one TIMED_RECORDED, then UF-09.5", async () => {
    seed({ phase: "timed", itemIndex: 3, timer: { startedAtMs: NOW, durationS: 53, pausedMs: 0 } });
    await renderLoaded();
    await advance(600_000);
    expect(screenId()).toBe("UF-09.5");
    expect(dispatched.map((e) => e.type)).toEqual(["TIMED_RECORDED"]);
    expect(countOf("TIMED_RECORDED")).toBe(1);
  });
});

describe("AC-9 the check point", () => {
  const lastBenchRest = (): Partial<FocusState> => ({
    phase: "rest",
    itemIndex: 0,
    setIndex: 3,
    timer: { startedAtMs: NOW, durationS: 120, pausedMs: 0 },
    loggedSets: benchLogged(4),
  });

  it("betweenItems is never rendered or seen: the persisted value after REST_END is next; the default gives UF-09.6", async () => {
    seed(lastBenchRest());
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await renderLoaded();
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      const id = document.querySelector("[data-screen-id]")?.getAttribute("data-screen-id");
      if (id) seen.push(id);
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    await advance(120_000);
    observer.disconnect();
    expect(screenId()).toBe("UF-09.6");
    expect(storedFocus()).toMatchObject({ phase: "next", itemIndex: 1 });
    const phases = setItem.mock.calls
      .filter(([k]) => k === KEY)
      .map(([, v]) => (JSON.parse(v) as FocusState).phase);
    expect(phases).toEqual(["next"]);
    expect(seen.every((id) => id === "UF-09.5" || id === "UF-09.6")).toBe(true);
    expect(document.body.textContent).not.toMatch(/betweenItems/);
  });

  it("an injected resolveCheckPoint is called once, with the state at item 0's end; 'timeCheck' gives UF-09.8", async () => {
    // T-0304d (D-0120 §4): UF-09.8 shows rule 8's answer, made fresh for an injected check
    // point, so the session is behind at the check (1500 s elapsed; P1 is then 60 s behind).
    await seedSession({ started_at: behindStartedAt(NOW + 120_000) });
    seed(lastBenchRest());
    const spy = vi.fn<ResolveCheckPoint>(() => "timeCheck");
    await renderLoaded({ resolveCheckPoint: spy });
    await advance(120_000);
    expect(spy).toHaveBeenCalledTimes(1);
    const [state, ctx, atMs] = spy.mock.calls[0]!;
    expect(state).toMatchObject({ phase: "betweenItems", itemIndex: 0, setIndex: 3 });
    expect(ctx.plan).toEqual(P1);
    expect(atMs).toBe(NOW + 120_000);
    expect(screenId()).toBe("UF-09.8");
    // T-0304d (D-0118 §12): the built UF-09.8's heading is the minutes behind.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1 min behind");
    expect(storedFocus()).toMatchObject({ phase: "timeCheck", itemIndex: 1 });
    // Not called mid-item: a rest inside an item never reaches the check point.
    await advance(600_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("the pair: the spy returning 'next' gives UF-09.6", async () => {
    seed(lastBenchRest());
    const spy = vi.fn<ResolveCheckPoint>(() => "next");
    await renderLoaded({ resolveCheckPoint: spy });
    await advance(120_000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screenId()).toBe("UF-09.6");
  });

  it("a rest that isn't an item's last never calls resolveCheckPoint", async () => {
    seed({ ...lastBenchRest(), setIndex: 1, loggedSets: benchLogged(2) });
    const spy = vi.fn<ResolveCheckPoint>(() => "timeCheck");
    await renderLoaded({ resolveCheckPoint: spy });
    await advance(120_000);
    expect(screenId()).toBe("UF-09.3");
    expect(spy).not.toHaveBeenCalled();
  });
});
