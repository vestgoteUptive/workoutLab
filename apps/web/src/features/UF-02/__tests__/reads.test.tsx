// T-0302c fold-in from the T-0302a accept: `use-today.ts` gives each cache-read effect run its own
// cancelled flag (a read for an older `now`/`timeZone` never overwrites a newer one), and clears
// the 3 s refresh cap timer when the refresh settles and when the screen unmounts.
//
// T-0471 (D-0177): the slot is mocked to `null`, as in `today.test.tsx` — this file's own
// `loadEngineHistory`/`loadProfile` call-count assertions would otherwise also count `CheckinCard`'s
// own reads of the same (real) profile fixture.
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { HistorySet } from "@workoutlab/shared";
import { F_TZ, L1, PROFILE, history, targets } from "./fixtures.js";
import { TodayTree, macrotask, tile } from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/engine-feed.js", () => ({
  loadEngineHistory: mocks.loadEngineHistory,
}));
vi.mock("../../../lib/offline/history.js", () => ({
  loadTargets: mocks.loadTargets,
  loadLibrary: mocks.loadLibrary,
  loadProfile: mocks.loadProfile,
  lastSyncedAt: mocks.lastSyncedAt,
  refreshAll: mocks.refreshAll,
}));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, balance: vi.fn(actual.balance) };
});

const { balance } = await import("@workoutlab/engine");
const balanceSpy = vi.mocked(balance);

const never = <T,>(): Promise<T> => new Promise<T>(() => {});
let online = false;

/** 6 back-squat sets yesterday: quads reads "6 / 20". An empty history reads "0 / 20". */
const SIX_QUADS = history("back-squat", "2026-09-26T18:00:00+02:00", 6);

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  online = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  balanceSpy.mockClear();
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const LATER = new Date("2026-09-27T13:00:00+02:00");

describe("a cache read for an older now/timeZone never lands over a newer one", () => {
  it.each([
    ["now", { ...F_TZ, now: LATER }],
    ["timeZone", { ...F_TZ, timeZone: "Europe/London" }],
  ])("%s changes mid-read: the late older read is dropped", async (_name, next) => {
    const older = deferred<HistorySet[]>();
    mocks.loadEngineHistory.mockReturnValueOnce(older.promise).mockResolvedValue([]);
    const { rerender } = render(<TodayTree {...F_TZ} />);
    rerender(<TodayTree {...next} />);
    await waitFor(() => expect(tile("quads")).toBe("0 / 20"));
    // The older read resolves last, with data that would read 6 / 20.
    older.resolve(SIX_QUADS);
    await macrotask();
    expect(tile("quads")).toBe("0 / 20");
    expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(2);
  });

  it("CONTRAST: with no change, the same slow read does land", async () => {
    const only = deferred<HistorySet[]>();
    mocks.loadEngineHistory.mockReturnValueOnce(only.promise);
    render(<TodayTree {...F_TZ} />);
    await macrotask();
    only.resolve(SIX_QUADS);
    await waitFor(() => expect(tile("quads")).toBe("6 / 20"));
  });

  it("a post-refresh re-read started for the older inputs is dropped when they change", async () => {
    online = true;
    const reread = deferred<HistorySet[]>();
    mocks.loadEngineHistory
      .mockResolvedValueOnce([]) // the mount read
      .mockReturnValueOnce(reread.promise) // the post-refresh re-read
      .mockResolvedValue([]); // the read for the new clock
    const { rerender } = render(<TodayTree {...F_TZ} />);
    await waitFor(() => expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(2));
    rerender(<TodayTree {...F_TZ} now={LATER} />);
    await waitFor(() => expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(tile("quads")).toBe("0 / 20"));
    reread.resolve(SIX_QUADS);
    await macrotask();
    expect(tile("quads")).toBe("0 / 20");
  });

  it("CONTRAST: the post-refresh re-read lands when nothing changed", async () => {
    online = true;
    const reread = deferred<HistorySet[]>();
    mocks.loadEngineHistory.mockResolvedValueOnce([]).mockReturnValueOnce(reread.promise);
    render(<TodayTree {...F_TZ} />);
    await waitFor(() => expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(2));
    reread.resolve(SIX_QUADS);
    await waitFor(() => expect(tile("quads")).toBe("6 / 20"));
  });
});

describe("the 3 s cap timer", () => {
  it("is cleared on unmount while the refresh still hangs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    online = true;
    mocks.refreshAll.mockReturnValue(never());
    const { unmount } = render(<TodayTree {...F_TZ} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    // No re-read after the unmount.
    expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(1);
  });

  it("is cleared when the refresh settles before 3 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    online = true;
    const refresh = deferred<void>();
    mocks.refreshAll.mockReturnValue(refresh.promise);
    render(<TodayTree {...F_TZ} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => {
      refresh.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(balanceSpy).toHaveBeenCalledTimes(2);
  });

  it("under StrictMode's remount, a hanging refresh still recomputes once at 3 000 ms", async () => {
    // Date too: the cap keeps the time left across the remount by Date.now().
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: F_TZ.now });
    online = true;
    mocks.refreshAll.mockReturnValue(never());
    render(
      <StrictMode>
        <TodayTree {...F_TZ} />
      </StrictMode>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const reads = mocks.loadEngineHistory.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(reads);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(reads + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mocks.loadEngineHistory).toHaveBeenCalledTimes(reads + 1);
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
  });
});
