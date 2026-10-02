// T-0303a UF-08.1 AC-9 (offline = online, NFR-OFF-3), AC-10 (the 3 s refresh cap, content memo,
// missing data; D-0071 §8, D-0104, D-0107 §3 §9) and AC-11 (offline indicator, D-0107 §8).
//
// The cap AC must fail under its two planted faults (build log in the ticket's accept log):
//   (a) awaiting `refreshAll` without the cap → no second read at 3 000 ms;
//   (b) memoising on array identity → an extra `suggest` call at 3 000 ms.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import type { HistorySet } from "@workoutlab/shared";
import { loadTargets, refreshAll } from "../../../lib/offline/history.js";
import { fTargets } from "./fixtures.js";
import {
  fCache,
  fitLine,
  hangLoaders,
  loaderReads,
  renderSetup,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const refresh = vi.mocked(refreshAll);

beforeEach(() => {
  vi.clearAllMocks();
  refresh.mockImplementation(async () => {});
  serveCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const loadedLine = async () =>
  waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));

function hardSet(id: string, exerciseId: string, at: string): HistorySet {
  return {
    clientId: id,
    sessionId: "S1",
    exerciseId,
    isWarmup: false,
    completedAt: at,
    editedAt: at,
    deletedAt: null,
    reps: 8,
    weightKg: 60,
    durationS: null,
  };
}

describe("AC-9 same result offline and online", () => {
  async function run(online: boolean): Promise<{ line: string; workout: Workout }> {
    setOnline(online);
    const view = renderSetup();
    await loadedLine();
    if (online) await waitFor(() => expect(loaderReads()).toEqual([2, 2, 2, 2]));
    else await settle();
    fireEvent.click(screen.getByRole("button", { name: "30 minutes" }));
    const result = {
      line: fitLine().textContent!,
      workout: spy.mock.results.at(-1)!.value as Workout,
    };
    view.unmount();
    return result;
  }

  it("the fit line and the Workout are deep-equal; offline calls refreshAll 0 times", async () => {
    const offline = await run(false);
    expect(refresh).toHaveBeenCalledTimes(0);
    vi.clearAllMocks();
    refresh.mockImplementation(async () => {});
    const online = await run(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(online.line).toBe(offline.line);
    expect(online.workout).toEqual(offline.workout);
    expect(online.line).toBe("Fits: 3 exercises, 9 sets + warm-up");
  });

  it("refreshAll gets the now instant and the timeZone prop", async () => {
    setOnline(true);
    renderSetup({
      now: "2026-09-27T12:00:00-04:00",
      locale: "en-US",
      timeZone: "America/New_York",
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [now, tz] = refresh.mock.calls[0]!;
    expect(now.toISOString()).toBe("2026-09-27T16:00:00.000Z");
    expect(tz).toBe("America/New_York");
  });
});

describe("AC-10 the cap: re-read after the refresh resolves or after 3 s", () => {
  it("never-resolving refresh (fake timers): one read, then exactly one re-read at 3 000 ms, no extra suggest", async () => {
    vi.useFakeTimers();
    setOnline(true);
    refresh.mockImplementation(() => new Promise<void>(() => {}));
    renderSetup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Rendered from the cache before 3 000 ms.
    expect(fitLine().textContent).toMatch(/^Fits: /);
    const calls = spy.mock.calls.length;
    expect(calls).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(loaderReads()).toEqual([1, 1, 1, 1]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(loaderReads()).toEqual([2, 2, 2, 2]);
    // New arrays, equal content: the memo keys on content, so no new call.
    expect(spy.mock.calls.length).toBe(calls);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(loaderReads()).toEqual([2, 2, 2, 2]);
    expect(spy.mock.calls.length).toBe(calls);
  });

  it("contrast: a refresh that resolves at once is re-read at once (no 3 s wait)", async () => {
    vi.useFakeTimers();
    setOnline(true);
    renderSetup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loaderReads()).toEqual([2, 2, 2, 2]);
  });

  it.each<[string, (refreshed: boolean) => ReturnType<typeof fCache>]>([
    [
      "one changed target",
      (r) =>
        fCache({
          targets: fTargets().map((t) => (r && t.area === "chest" ? { ...t, setsPer14d: 22 } : t)),
        }),
    ],
    [
      "a new set",
      (r) =>
        fCache({
          history: r ? [hardSet("n1", "bench-press", "2026-09-26T10:00:00+02:00")] : [],
        }),
    ],
  ])("a refresh that lands %s makes exactly one more suggest call", async (_name, content) => {
    setOnline(true);
    let refreshed = false;
    let land: () => void = () => {};
    refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          land = () => {
            refreshed = true;
            resolve();
          };
        }),
    );
    serveCache(() => content(refreshed));
    renderSetup();
    await loadedLine();
    await settle();
    const calls = spy.mock.calls.length;
    expect(calls).toBe(1);
    await act(async () => {
      land();
    });
    await waitFor(() => expect(loaderReads()).toEqual([2, 2, 2, 2]));
    await settle();
    expect(spy.mock.calls.length).toBe(calls + 1);
  });

  it("a rejected refresh renders from the cache with no alert and no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      setOnline(true);
      refresh.mockImplementation(async () => {
        throw new Error("offline mid-refresh");
      });
      renderSetup();
      await loadedLine();
      await settle(100);
      expect(fitLine().textContent).toMatch(/^Fits: /);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("AC-10 missing data (D-0107 §9)", () => {
  async function expectMissing(): Promise<void> {
    await screen.findByText("Connect to finish setting up your plan");
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "5 minutes less" })).toBeNull();
    expect(screen.queryByRole("button", { name: "30 minutes" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggest my workout" })).toBeNull();
    await settle();
    expect(spy).toHaveBeenCalledTimes(0);
  }

  it("no profile → the message, a link to /, no controls, 0 suggest calls", async () => {
    setOnline(false);
    serveCache(() => fCache({ profile: null }));
    renderSetup();
    await expectMissing();
  });

  it("8 targets → the same", async () => {
    setOnline(false);
    serveCache(() => fCache({ targets: fTargets().slice(0, 8) }));
    renderSetup();
    await expectMissing();
  });

  it("contrast: profile + 9 targets → no message", async () => {
    setOnline(false);
    renderSetup();
    await loadedLine();
    expect(screen.queryByText("Connect to finish setting up your plan")).toBeNull();
  });

  it("a rejecting loader → the message, no uncaught error", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      setOnline(false);
      vi.mocked(loadTargets).mockRejectedValue(new Error("IDB closed"));
      renderSetup();
      await expectMissing();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("while loading the controls show; the message does not", () => {
    setOnline(false);
    hangLoaders();
    renderSetup();
    expect(screen.queryByText("Connect to finish setting up your plan")).toBeNull();
    expect(screen.getByRole("button", { name: "5 minutes less" })).toBeInTheDocument();
  });
});

describe("AC-11 offline indicator (D-0107 §8)", () => {
  it("offline: an aria-label=Offline element and no 'Offline ·' text", async () => {
    setOnline(false);
    renderSetup();
    await loadedLine();
    expect(screen.getByLabelText("Offline")).toBeInTheDocument();
    expect(screen.queryByText(/Offline ·/)).toBeNull();
  });

  it("online: neither", async () => {
    setOnline(true);
    renderSetup();
    await loadedLine();
    expect(screen.queryByLabelText("Offline")).toBeNull();
    expect(screen.queryByText(/Offline ·/)).toBeNull();
  });
});
