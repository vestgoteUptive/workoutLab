// T-0304e AC-5 (`finish()`, D-0071 §5 §6: the whole stored row, navigation only after the write)
// and AC-6 (`done` → `finish()` with no confirm). The AC-5 "navigate after the write" test is the
// planted-fault test: navigating before awaiting the write turns it red (build log).
import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as offline from "../../../lib/offline/index.js";
import { upsertSession as realUpsert } from "../../../lib/offline/queue.js";
import { initialFocusState, type FocusState } from "../machine.js";
import { P1, S1, STARTED_AT, STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { probe, session } from "./probe.js";
import { call, currentLocation, deferred, renderSession } from "./session-helpers.js";
import { dispatched, stores } from "./store-spy.js";

vi.mock("../../../lib/offline/index.js", (orig) =>
  import("./offline-spies.js").then((m) => m.offlineSpies(orig)),
);
vi.mock("../store.js", (orig) => import("./store-spy.js").then((m) => m.storeSpy(orig)));
vi.mock("../views.js", (orig) => import("./probe.js").then((m) => m.probedViews(orig)));
// Records, at the moment `navigate` is called, whether the focus key still exists, so "remove
// the key, then navigate" is pinned (a re-render happens only after both, so a location probe
// can't tell the order apart).
const navCalls = vi.hoisted(() => [] as { to: unknown; keyPresent: boolean }[]);
vi.mock("react-router", async (orig) => {
  const actual = (await orig()) as typeof import("react-router");
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      const call = navigate as (...args: unknown[]) => unknown;
      return ((...args: unknown[]) => {
        navCalls.push({
          to: args[0],
          keyPresent: window.localStorage.getItem("wl-focus:S1") !== null,
        });
        return call(...args);
      }) as typeof navigate;
    },
  };
});

const NOW = STARTED_AT_MS + 40 * 60_000;
const KEY = `wl-focus:${S1}`;
const SUMMARY = `/session/${S1}/summary`;
const upsertSpy = vi.mocked(offline.upsertSession);

function seedFocus(state: Partial<FocusState>): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...initialFocusState(S1, P1, NOW), timer: null, ...state }),
  );
}

/** The T-0318 UF-03.3 stub, found with `findBy` (D-0103). */
function findSummary(): Promise<HTMLElement> {
  return screen.findByText((_, el) => el?.getAttribute("data-screen-id") === "UF-03.3");
}

function endedWrites() {
  return upsertSpy.mock.calls.filter(([row]) => row.ended_at != null);
}

const plankSet = (setIndex: number) => ({
  sessionId: S1,
  itemIndex: 3,
  exerciseId: "plank",
  setIndex,
  kind: "timed" as const,
  durationS: 50,
  isWarmup: false,
  backoff: false,
});

beforeEach(() => {
  window.localStorage.clear();
  dispatched.length = 0;
  stores.length = 0;
  probe.current = null;
  currentLocation.pathname = "";
  navCalls.length = 0;
  upsertSpy.mockClear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AC-5 finish()", () => {
  it.each([
    ["online", true],
    ["offline", false],
  ])(
    "%s: reads the stored row, writes {...row, ended_at: now}, removes the focus key, then navigates",
    async (_label, onLine) => {
      vi.stubGlobal("navigator", { ...navigator, onLine, language: "en-GB" });
      const fetchSpy = vi.fn(() => Promise.reject(new Error("no network")));
      vi.stubGlobal("fetch", fetchSpy);
      await seedSession();
      seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
      await renderSession();
      // Changed behind the hook's back: finish() must read the stored row, not a cached one.
      const stored = (await offline.offlineDb().sessions.get(S1))!.row;
      await realUpsert({ ...stored, location: "gym" });

      const order: string[] = [];
      upsertSpy.mockImplementationOnce(async (row) => {
        order.push(
          `write key=${window.localStorage.getItem(KEY) !== null} at=${currentLocation.pathname}`,
        );
        return realUpsert(row);
      });
      await call(() => session().finish());
      order.push(
        `after key=${window.localStorage.getItem(KEY) !== null} at=${currentLocation.pathname}`,
      );

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy).toHaveBeenCalledWith({
        ...stored,
        location: "gym",
        ended_at: new Date(NOW).toISOString(),
      });
      expect(upsertSpy.mock.calls[0]![0].started_at).toBe(STARTED_AT);
      // At the moment navigate is called, the focus key is already gone.
      expect(navCalls).toEqual([{ to: SUMMARY, keyPresent: false }]);
      expect(order).toEqual([`write key=true at=/session/${S1}`, `after key=false at=${SUMMARY}`]);
      expect((await offline.offlineDb().sessions.get(S1))!.row.ended_at).toBe(
        new Date(NOW).toISOString(),
      );
      vi.useRealTimers(); // findBy polls on real timers (D-0103); the clock-dependent part is over
      expect(await findSummary()).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("a session restored from an earlier day still sends its original started_at", async () => {
    const lateStart = "2026-09-26T23:30:00.000Z";
    vi.setSystemTime(Date.parse("2026-09-27T01:10:00.000Z"));
    await seedSession({ started_at: lateStart });
    seedFocus({ phase: "set" });
    await renderSession();
    await call(() => session().finish());
    expect(upsertSpy.mock.calls[0]![0]).toMatchObject({
      started_at: lateStart,
      time_budget_min: 45,
      energy: "normal",
      warmup_in_budget: true,
      ended_at: "2026-09-27T01:10:00.000Z",
    });
  });

  it("navigate only after the write: with the write held, no navigation and the key is kept after 50 ms", async () => {
    await seedSession();
    seedFocus({ phase: "paused", resumePhase: "set", pausedAtMs: NOW });
    await renderSession();
    const held = deferred<void>();
    upsertSpy.mockImplementationOnce(async (row) => {
      await held.promise;
      return realUpsert(row);
    });
    let done = false;
    let finishing!: Promise<void>;
    act(() => {
      finishing = session().finish();
      void finishing.then(() => {
        done = true;
      });
    });
    await flushReal(50);
    expect(currentLocation.pathname).toBe(`/session/${S1}`);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(screenId()).toBe("UF-09.9");
    expect(done).toBe(false);

    await act(async () => {
      held.resolve();
      await finishing;
    });
    await flushReal();
    expect(currentLocation.pathname).toBe(SUMMARY);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("one finish: a second finish() while pending makes no second write", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    const held = deferred<void>();
    upsertSpy.mockImplementationOnce(async (row) => {
      await held.promise;
      return realUpsert(row);
    });
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = session().finish();
      second = session().finish();
    });
    await flushReal();
    await act(async () => {
      held.resolve();
      await Promise.all([first, second]);
    });
    await flushReal();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(currentLocation.pathname).toBe(SUMMARY);
  });

  it("a rejected write keeps the key, doesn't navigate, and rejects from finish()", async () => {
    await seedSession();
    seedFocus({ phase: "set" });
    await renderSession();
    upsertSpy.mockRejectedValueOnce(new Error("quota"));
    let error: unknown;
    await act(async () => {
      await session()
        .finish()
        .catch((e: unknown) => {
          error = e;
        });
    });
    await flushReal(50);
    expect(error).toBeInstanceOf(Error);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(currentLocation.pathname).toBe(`/session/${S1}`);
    expect((await offline.offlineDb().sessions.get(S1))!.row.ended_at).toBeNull();

    // A failed finish can be retried; this one writes.
    await call(() => session().finish());
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(currentLocation.pathname).toBe(SUMMARY);
  });
});

describe("AC-6 done → finish()", () => {
  it("P1's last plank set recorded → done → one finish with no confirm → /session/S1/summary (UF-03.3)", async () => {
    await seedSession();
    seedFocus({
      phase: "timed",
      itemIndex: 3,
      setIndex: 1,
      loggedSets: [
        {
          clientId: "p0",
          itemIndex: 3,
          setIndex: 0,
          exerciseId: "plank",
          reps: null,
          weightKg: null,
          durationS: 50,
          rir: null,
          backoff: false,
        },
      ],
    });
    await renderSession();
    await call(() => session().recordSet(plankSet(1)));
    vi.useRealTimers(); // findBy polls on real timers (D-0103)
    const summary = await findSummary();
    expect(summary).toBeTruthy();
    expect(currentLocation.pathname).toBe(SUMMARY);
    expect(endedWrites()).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await flushReal(50);
    expect(endedWrites()).toHaveLength(1);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("the pair: in rest of the last-but-one set, no write with ended_at happens", async () => {
    await seedSession();
    seedFocus({ phase: "timed", itemIndex: 3, setIndex: 0 });
    await renderSession();
    await call(() => session().recordSet(plankSet(0)));
    expect(session().state.phase).toBe("rest");
    await flushReal(50);
    expect(endedWrites()).toHaveLength(0);
    expect(currentLocation.pathname).toBe(`/session/${S1}`);
    expect(screenId()).toBe("UF-09.5");
  });
});
