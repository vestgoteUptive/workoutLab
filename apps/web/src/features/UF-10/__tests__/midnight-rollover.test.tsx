// T-0343 UF-10.1 / UF-10.2: a mounted Balance screen rolls the 14-day window over at local
// midnight (60 s check + visibilitychange), from the cache, with no remount and no extra refresh.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, screen, waitFor } from "@testing-library/react";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import * as engineFeed from "../../../lib/offline/engine-feed.js";
import * as history from "../../../lib/offline/history.js";
import { useBalance } from "../use-balance.js";
import { BACK_SQUAT, LIBRARY, LOCALE, RDL, TZ, defaultTargets, sets } from "./fixtures.js";
import {
  freshDb,
  pollUntil,
  renderBalance,
  rowAreas,
  rowValue,
  seedCache,
  signIn,
  signOut,
} from "./test-helpers.js";

vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const seed = sets(BACK_SQUAT.id, "2026-09-14T23:59:00+02:00", 1, { prefix: "d13" });
const mountProps = { timeZone: TZ, locale: LOCALE };
const BEFORE = "2026-09-27T23:59:30+02:00";
// One extra set, logged on the old day after the first read; only the T-0925 tests seed it.
const makeExtra = () => sets(BACK_SQUAT.id, "2026-09-27T20:00:00+02:00", 1, { prefix: "x" });

let db: OfflineDb;

beforeEach(() => {
  db = freshDb();
  signIn();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(BEFORE));
});

afterEach(() => {
  cleanup();
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const h1 = () => screen.getByRole("heading", { level: 1 });
const waitForRows = () => waitFor(() => expect(rowAreas()).toHaveLength(9));
const tick = (ms = 60_000) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const visibility = (state: "visible" | "hidden") => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  return act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

async function mountSeeded() {
  await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
  renderBalance(mountProps);
  await waitForRows();
  expect(rowValue("quads")).toBe("1 / 20");
  expect(h1()).toHaveTextContent(en.uf10.window("14–27 Sep"));
}

describe("T-0343 midnight rollover", () => {
  it("T-0343 AC-1 the 60 s tick rolls the window without a remount", async () => {
    await mountSeeded();
    const before = h1();
    await tick();
    await waitFor(() => expect(rowValue("quads")).toBe("0 / 20"));
    expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep"));
    expect(h1()).toBe(before);
  });

  it("T-0343 AC-2 UF-10.2 follows", async () => {
    await seedCache(db, {
      library: LIBRARY,
      targets: defaultTargets(),
      sets: sets(RDL.id, "2026-09-17T18:00:00+02:00", 1),
    });
    renderBalance({ ...mountProps, at: "/balance/hamstrings" });
    await waitFor(() =>
      expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
        en.uf10.lastTrainedDaysAgo("10"),
      ),
    );
    await tick();
    await waitFor(() =>
      expect(document.querySelector('[data-part="last-trained"]')).toHaveTextContent(
        en.uf10.lastTrainedDaysAgo("11"),
      ),
    );
    expect(document.querySelector('[data-part="strip-cell"]')!.getAttribute("data-date")).toBe(
      "2026-09-15",
    );
  });

  it("T-0343 AC-3 visibilitychange catches up after 10 days; hidden does nothing", async () => {
    await mountSeeded();
    vi.setSystemTime(new Date("2026-10-07T08:00:00+02:00"));
    await visibility("hidden");
    expect(h1()).toHaveTextContent(en.uf10.window("14–27 Sep"));
    await visibility("visible");
    await waitFor(() => expect(h1()).toHaveTextContent(en.uf10.window("24 Sep–7 Oct")));
    expect(rowValue("quads")).toBe("0 / 20");
  });

  it("T-0343 AC-4 same day: no cache read", async () => {
    vi.setSystemTime(new Date("2026-09-27T12:00:00+02:00"));
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
    renderBalance(mountProps);
    await waitForRows();
    const spy = vi.spyOn(history, "loadTargets");
    for (let i = 0; i < 5; i += 1) await tick();
    await visibility("visible");
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("T-0343 AC-5 no second refresh at the rollover", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await mountSeeded();
    // T-0926: a spy count is not a DOM change, so `waitFor` (no polling under the fake
    // setInterval) can miss it; poll on the real clock instead.
    await pollUntil(() => expect(refresh).toHaveBeenCalledTimes(1));
    await tick();
    await waitFor(() => expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("T-0924 AC-1 a refresh re-read that outlives the rollover cannot repaint the old window", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    const real = history.loadTargets;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    // Call 1 is the first paint; call 2 is the refresh's re-read, held until after the rollover.
    vi.spyOn(history, "loadTargets").mockImplementation(async () => {
      calls += 1;
      const out = await real();
      if (calls === 2) await gate;
      return out;
    });
    await mountSeeded();
    await pollUntil(() => expect(calls).toBe(2)); // T-0926: a counter, not a DOM change
    await tick();
    await waitFor(() => expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep")));
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep"));
    expect(rowValue("quads")).toBe("0 / 20");
  });

  it("T-0925 AC1 + AC4 a rollover read that started earlier never publishes over the refresh re-read", async () => {
    const extra = makeExtra();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    let finishRefresh: () => void = () => undefined;
    vi.spyOn(history, "refreshAll").mockReturnValue(
      new Promise<void>((r) => {
        finishRefresh = r;
      }),
    );
    const real = engineFeed.loadEngineHistory;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    let rolloverHasRows = false;
    // Call 1 is the first paint, call 2 the rollover read (pre-refresh rows, then held), call 3
    // the refresh's re-read.
    vi.spyOn(engineFeed, "loadEngineHistory").mockImplementation(async () => {
      calls += 1;
      const out = await real();
      if (calls === 2) {
        rolloverHasRows = true;
        await gate;
      }
      return out;
    });
    await mountSeeded();
    await tick();
    await pollUntil(() => expect(rolloverHasRows).toBe(true)); // T-0926: a flag, not DOM
    await seedCache(db, { sets: extra });
    await act(async () => {
      finishRefresh();
    });
    await waitFor(() => {
      expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep"));
      expect(rowValue("quads")).toBe("1 / 20");
    });
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(rowValue("quads")).toBe("1 / 20");
    expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep"));
    // AC4: the dropped read left the screen settled, all nine rows present.
    expect(rowAreas()).toHaveLength(9);
    expect(screen.queryByText(en.uf10.noData)).toBeNull();
  });

  it("T-0925 AC4 a dropped read still settles the hook", async () => {
    const extra = makeExtra();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    let finishRefresh: () => void = () => undefined;
    vi.spyOn(history, "refreshAll").mockReturnValue(
      new Promise<void>((r) => {
        finishRefresh = r;
      }),
    );
    const real = engineFeed.loadEngineHistory;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    let held = false;
    vi.spyOn(engineFeed, "loadEngineHistory").mockImplementation(async () => {
      calls += 1;
      const out = await real();
      if (calls === 2) {
        held = true;
        await gate;
      }
      return out;
    });
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
    const { result, rerender } = renderHook(
      (p: { now: Date }) => useBalance({ now: p.now, timeZone: TZ, status: "signed-in" }),
      { initialProps: { now: new Date(BEFORE) } },
    );
    await vi.waitFor(() => expect(result.current.result).not.toBeNull());
    rerender({ now: new Date("2026-09-28T00:00:30+02:00") });
    await vi.waitFor(() => expect(held).toBe(true));
    await seedCache(db, { sets: extra });
    await act(async () => {
      finishRefresh();
    });
    await vi.waitFor(() => expect(result.current.settled).toBe(true));
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.settled).toBe(true);
    const quads = result.current.result?.areas.find((a) => a.area === "quads");
    expect(quads?.load).toBe(1);
  });

  it("T-0925 AC3 a rollover read that starts after the refresh finished still publishes", async () => {
    const extra = makeExtra();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await mountSeeded();
    await pollUntil(() => expect(refresh).toHaveBeenCalledTimes(1)); // T-0926: a spy count
    await seedCache(db, { sets: extra });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await tick();
    await waitFor(() => expect(h1()).toHaveTextContent(en.uf10.window("15–28 Sep")));
    await waitFor(() => expect(rowValue("quads")).toBe("1 / 20"));
  });

  // T-0926 AC2: the non-DOM wait that flaked. The refresh answers 100 ms (real time) after the
  // first paint, so the re-read's first loadTargets call lands with no DOM change after it (the
  // re-read is held, so nothing publishes). No CPU load is needed to force that ordering.
  async function mountWithLateRefresh() {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.spyOn(history, "refreshAll").mockImplementation(
      () => new Promise<undefined>((r) => setTimeout(() => r(undefined), 100)),
    );
    const real = history.loadTargets;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const seen = { calls: 0 };
    vi.spyOn(history, "loadTargets").mockImplementation(async () => {
      seen.calls += 1;
      const out = await real();
      if (seen.calls === 2) await gate;
      return out;
    });
    await mountSeeded();
    return { seen, release };
  }

  it("T-0926 AC2 waitFor never sees a counter that changes after the last DOM change (fake setInterval)", async () => {
    const { seen, release } = await mountWithLateRefresh();
    await expect(waitFor(() => expect(seen.calls).toBe(2), { timeout: 400 })).rejects.toThrow(
      /expected 1 to be 2/,
    );
    // The counter did reach 2 meanwhile: the miss is the wait mechanism, not the hook.
    expect(seen.calls).toBe(2);
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 20));
    });
  });

  it("T-0926 AC2 pollUntil sees the late counter without any DOM change", async () => {
    const { seen, release } = await mountWithLateRefresh();
    await pollUntil(() => expect(seen.calls).toBe(2), 1000);
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 20));
    });
  });

  it("T-0343 AC-6 unmount clears the timer and the listener", async () => {
    await mountSeeded();
    const err = vi.spyOn(console, "error");
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    await visibility("visible");
    expect(err).toHaveBeenCalledTimes(0);
  });

  it("T-0343 AC-7 the now seam stays fixed", async () => {
    await seedCache(db, { library: LIBRARY, targets: defaultTargets(), sets: seed });
    renderBalance({ ...mountProps, now: new Date(BEFORE) });
    await waitForRows();
    await tick();
    await visibility("visible");
    expect(h1()).toHaveTextContent(en.uf10.window("14–27 Sep"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
