// T-0302a UF-02.1 with the `lib/offline` loaders mocked (AC-1, AC-2, AC-4, AC-6, AC-7, AC-8,
// AC-9, AC-10, AC-12 first paint). `balance` and `BodyMap` are spies that call the real ones,
// so "the real engine" holds unless a test stubs a `BalanceResult` on purpose.
//
// T-0471 (D-0177): `todayCheckinSlot` is now a real lazy `CheckinCard` (D-0174 §1). This file's
// own profile/history fixtures, read by the real `evaluatePlanCheckin` the card runs, produce a
// genuine step-down proposal, which would otherwise render the card where several tests here
// expect the attention line, C-01 or a steady `loadProfile` call count. None of that is this
// file's concern (it belongs to `slot.test.tsx` and UF-11's own tests), so the slot is mocked
// back to `null` here, the same shape `slot.test.tsx`'s own "AC-5 null" cases use.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BalanceResult } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import {
  AREA_ORDER,
  BALANCED,
  F_TARGETS,
  F_TZ,
  L1,
  LOCALE,
  OLDER_ONLY,
  PROFILE,
  R5_E1,
  TZ,
  history,
  resultWithAttention,
  targets,
} from "./fixtures.js";
import { TodayTree, aboveStart, location, macrotask, part, renderToday, tile } from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, redirectTarget: "/welcome" as const, signOut: vi.fn() }),
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
vi.mock("../../../lib/offline/queue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/queue.js")>();
  return { ...actual, upsertSession: vi.fn(actual.upsertSession) };
});
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, balance: vi.fn(actual.balance) };
});
vi.mock("../../../components/body-map/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../components/body-map/index.js")>();
  return { ...actual, BodyMap: vi.fn(actual.BodyMap) };
});

const { balance } = await import("@workoutlab/engine");
const { BodyMap } = await import("../../../components/body-map/index.js");
const { upsertSession } = await import("../../../lib/offline/queue.js");
const realEngine = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
const balanceSpy = vi.mocked(balance);
const bodyMapSpy = vi.mocked(BodyMap);

const never = <T,>(): Promise<T> => new Promise<T>(() => {});
let online = false;

beforeEach(() => {
  online = false;
  auth.status = "signed-in";
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  balanceSpy.mockReset();
  balanceSpy.mockImplementation(realEngine.balance);
  bodyMapSpy.mockClear();
  vi.mocked(upsertSession).mockClear();
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function hangEveryLoader(): void {
  for (const fn of [
    mocks.loadEngineHistory,
    mocks.loadTargets,
    mocks.loadLibrary,
    mocks.loadProfile,
    mocks.lastSyncedAt,
  ]) {
    fn.mockReturnValue(never());
  }
}

const dateLine = (now: Date, locale = LOCALE, timeZone = TZ): string =>
  new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);

/** Waits until the engine's tiles are on screen. */
async function waitForTiles(): Promise<void> {
  await waitFor(() => expect(tile("chest")).not.toBeNull());
}

/** A contract-typed stub, handed to the engine-typed spy (`coverageStep` is wider there). */
const stub = (result: BalanceResult) => result as unknown as ReturnType<typeof realEngine.balance>;

function firstResult(): BalanceResult {
  return balanceSpy.mock.results[0]!.value as BalanceResult;
}

describe("AC-1 frame and date on the first commit", () => {
  it("with every loader pending: one data-screen-id, the h1 and the F-tz date line, synchronously", () => {
    hangEveryLoader();
    renderToday(F_TZ);
    const ids = document.querySelectorAll("[data-screen-id]");
    expect(ids).toHaveLength(1);
    expect(ids[0]).toHaveAttribute("data-screen-id", "UF-02.1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.screens.today);
    const line = part("date")!.textContent!;
    expect(line).toBe(dateLine(F_TZ.now));
    expect(line).toContain("Sunday");
    expect(line).toContain("27 September");
  });

  it("the other side of the tz boundary: 22:30Z is Monday 28 September in Stockholm", () => {
    hangEveryLoader();
    const now = new Date("2026-09-27T22:30:00Z");
    renderToday({ ...F_TZ, now });
    const line = part("date")!.textContent!;
    expect(line).toBe(dateLine(now));
    expect(line).toContain("Monday");
    expect(line).toContain("28 September");
    expect(line).not.toContain("Sunday");
  });

  it("defaults: navigator stubbed as {onLine} only gives no throw and the en-GB date line", () => {
    hangEveryLoader();
    vi.stubGlobal("navigator", { onLine: true });
    const now = new Date();
    expect(() => renderToday({ now })).not.toThrow();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(part("date")!.textContent).toBe(dateLine(now, "en-GB", tz));
  });

  it("defaults, other value: a string navigator.language is the device locale", () => {
    hangEveryLoader();
    vi.stubGlobal("navigator", { onLine: true, language: "de-DE" });
    const now = new Date();
    renderToday({ now });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(part("date")!.textContent).toBe(dateLine(now, "de-DE", tz));
    expect(part("date")!.textContent).not.toBe(dateLine(now, "en-GB", tz));
  });

  it("the injected tz reaches balance(…, tz) and refreshAll(now, tz)", async () => {
    online = true;
    renderToday(F_TZ);
    await waitForTiles();
    await waitFor(() => expect(balanceSpy).toHaveBeenCalledTimes(2));
    expect(balanceSpy.mock.calls[0]![3]).toBe(F_TZ.now.toISOString());
    expect(balanceSpy.mock.calls[0]![4]).toBe(TZ);
    expect(mocks.refreshAll).toHaveBeenCalledWith(F_TZ.now, TZ);
  });
});

describe("AC-2 compact C-01", () => {
  it("BodyMap gets areas reference-equal to result.areas and loading false", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    const props = bodyMapSpy.mock.lastCall![0];
    expect(props.variant).toBe("compact");
    expect(props.areas).toBe(firstResult().areas);
    expect(props.loading).toBe(false);
  });

  it("exactly one compact link to /balance, with nothing focusable inside it", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    const links = screen.getAllByRole("link", { name: en.bodyMap.compactLink });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/balance");
    expect(
      links[0]!.querySelectorAll("a, button, input, select, textarea, [tabindex], [href]"),
    ).toHaveLength(0);
  });

  it("clicking it lands on /balance", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    fireEvent.click(screen.getByRole("link", { name: en.bodyMap.compactLink }));
    expect(location()).toBe("/balance");
  });
});

describe("AC-4 attention line", () => {
  it("R5-E1: 'Needs attention: Chest, Back, Shoulders +6 more', the first 3 in result.areas order", async () => {
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(part("attention")!.textContent).toBe("Needs attention: Chest, Back, Shoulders +6 more");
    const flagged = firstResult().areas.filter((a) => a.needsAttention);
    expect(flagged).toHaveLength(9);
    expect(flagged.slice(0, 3).map((a) => a.area)).toEqual(["chest", "back", "shoulders"]);
    const more = screen.getByRole("link", { name: "+6 more" });
    expect(more).toHaveAttribute("href", "/balance");
    fireEvent.click(more);
    expect(location()).toBe("/balance");
  });

  it("2 attention areas (back, then chest): 'Needs attention: Back, Chest', engine order, no more link", async () => {
    balanceSpy.mockReturnValue(stub(resultWithAttention(["back", "chest"])));
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(part("attention")!.textContent).toBe("Needs attention: Back, Chest");
    expect(part("attention-more")).toBeNull();
  });

  it("3 attention areas: all named, no more link (the boundary of +N)", async () => {
    balanceSpy.mockReturnValue(stub(resultWithAttention(["calves", "core", "arms"])));
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(part("attention")!.textContent).toBe("Needs attention: Calves, Core, Arms");
    expect(part("attention-more")).toBeNull();
  });

  it("4 attention areas: the line ends '+1 more'", async () => {
    balanceSpy.mockReturnValue(stub(resultWithAttention(["quads", "back", "chest", "calves"])));
    renderToday(F_TZ);
    await waitFor(() => expect(part("attention")).not.toBeNull());
    expect(part("attention")!.textContent).toBe("Needs attention: Quads, Back, Chest +1 more");
    expect(part("attention")!.textContent!.endsWith("+1 more")).toBe(true);
  });

  it("0 attention areas: no attention line", async () => {
    mocks.loadEngineHistory.mockResolvedValue(BALANCED);
    balanceSpy.mockReturnValue(stub(resultWithAttention([])));
    renderToday(F_TZ);
    await waitForTiles();
    expect(part("attention")).toBeNull();
    // With the colon: C-01's own legend says "Needs attention" without one.
    expect(document.body.textContent).not.toContain("Needs attention:");
  });
});

describe("AC-6 Start → UF-08.1", () => {
  it("is a link 'Start workout' to /session/setup, and clicking it lands there", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).toHaveAttribute("href", "/session/setup");
    fireEvent.click(start);
    expect(location()).toBe("/session/setup");
  });

  it.each([
    ["offline", false],
    ["online", true],
  ])("is present and enabled %s", async (_name, value) => {
    online = value;
    renderToday(F_TZ);
    await waitForTiles();
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start).not.toHaveAttribute("aria-disabled");
    expect(start).not.toHaveAttribute("disabled");
  });

  it("never calls upsertSession, also after a tap", async () => {
    online = true;
    renderToday(F_TZ);
    await waitForTiles();
    fireEvent.click(screen.getByRole("link", { name: "Start workout" }));
    await macrotask();
    expect(upsertSession).toHaveBeenCalledTimes(0);
  });
});

describe("AC-7 which line shows above Start (real engine, F-targets, a profile)", () => {
  it("empty history: 9 tiles at 0 / target and 'No workouts yet' directly above Start", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    for (const area of AREA_ORDER) expect(tile(area), area).toBe(`0 / ${F_TARGETS[area]}`);
    expect(tile("chest")).toBe("0 / 20");
    expect(tile("calves")).toBe("0 / 12");
    expect(aboveStart()).toBe(part("no-workouts"));
    expect(aboveStart()!.textContent).toBe("No workouts yet. Start your first one.");
    expect(part("attention")).toBeNull();
    expect(part("nothing-recent")).toBeNull();
  });

  it("only older sets: all tiles 0 and 'Nothing logged in the last 14 days' directly above Start", async () => {
    mocks.loadEngineHistory.mockResolvedValue(OLDER_ONLY);
    renderToday(F_TZ);
    await waitForTiles();
    for (const area of AREA_ORDER) expect(tile(area), area).toBe(`0 / ${F_TARGETS[area]}`);
    expect(aboveStart()).toBe(part("nothing-recent"));
    expect(aboveStart()!.textContent).toBe(
      "Nothing logged in the last 14 days. Start a workout to pick up again.",
    );
    expect(part("attention")).toBeNull();
    expect(part("no-workouts")).toBeNull();
  });

  it("only warm-up sets in the history: isHardSet is false for all, so 'No workouts yet'", async () => {
    mocks.loadEngineHistory.mockResolvedValue(
      history("back-squat", "2026-09-01T18:00:00+02:00", 3, { isWarmup: true }),
    );
    renderToday(F_TZ);
    await waitForTiles();
    expect(part("no-workouts")).not.toBeNull();
    expect(part("nothing-recent")).toBeNull();
  });

  it("R5-E1: the attention line shows, and neither empty line does", async () => {
    mocks.loadEngineHistory.mockResolvedValue(R5_E1);
    renderToday(F_TZ);
    await waitForTiles();
    expect(part("attention")).not.toBeNull();
    // T-0302c: the suggestion card sits between the attention line and Start (D-0106 §1).
    expect(aboveStart()).toBe(part("card"));
    expect(part("card")!.previousElementSibling).toBe(part("attention"));
    expect(part("no-workouts")).toBeNull();
    expect(part("nothing-recent")).toBeNull();
  });

  it("a balanced history: none of the three lines", async () => {
    mocks.loadEngineHistory.mockResolvedValue(BALANCED);
    renderToday(F_TZ);
    await waitForTiles();
    expect(firstResult().areas.some((a) => a.needsAttention)).toBe(false);
    expect(firstResult().areas.some((a) => a.load > 0)).toBe(true);
    expect(part("attention")).toBeNull();
    expect(part("no-workouts")).toBeNull();
    expect(part("nothing-recent")).toBeNull();
    // T-0302c: the suggestion card sits between C-01 and Start (D-0106 §1).
    expect(aboveStart()).toBe(part("card"));
    expect(part("card")!.previousElementSibling).toBe(
      document.querySelector('[data-component="C-01"]'),
    );
  });
});

describe("AC-8 loading and refresh", () => {
  it("loading: C-01 is aria-busy, and there is no attention line and no no-workouts line", () => {
    hangEveryLoader();
    renderToday(F_TZ);
    expect(document.querySelector('[data-component="C-01"]')).toHaveAttribute("aria-busy", "true");
    expect(bodyMapSpy.mock.lastCall![0].loading).toBe(true);
    expect(part("attention")).toBeNull();
    expect(part("no-workouts")).toBeNull();
    expect(part("nothing-recent")).toBeNull();
  });

  it("loaded: C-01 is no longer busy", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    expect(document.querySelector('[data-component="C-01"]')).not.toHaveAttribute("aria-busy");
  });

  it("online: refreshAll once per mount, then one more balance over the refreshed cache", async () => {
    online = true;
    mocks.loadEngineHistory
      .mockResolvedValueOnce([])
      .mockResolvedValue(history("back-squat", "2026-09-26T18:00:00+02:00", 6));
    renderToday(F_TZ);
    await waitFor(() => expect(tile("quads")).toBe("6 / 20"));
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
    expect(balanceSpy).toHaveBeenCalledTimes(2);
    await macrotask();
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
    expect(balanceSpy).toHaveBeenCalledTimes(2);
  });

  it("offline: refreshAll is not called (0 after a 50 ms macrotask)", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    await macrotask();
    expect(mocks.refreshAll).toHaveBeenCalledTimes(0);
    expect(balanceSpy).toHaveBeenCalledTimes(1);
  });

  it.each([["stale"], ["signed-out"]] as const)(
    "online but %s: no refreshAll (0 after a 50 ms macrotask), one balance over the cache",
    async (status) => {
      online = true;
      auth.status = status;
      renderToday(F_TZ);
      await waitForTiles();
      await macrotask();
      expect(tile("chest")).toBe("0 / 20");
      expect(mocks.refreshAll).toHaveBeenCalledTimes(0);
      expect(balanceSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("stale → signed-in during the mount: exactly one refreshAll, never a second", async () => {
    online = true;
    auth.status = "stale";
    const { rerender } = render(<TodayTree {...F_TZ} />);
    await waitForTiles();
    await macrotask();
    expect(mocks.refreshAll).toHaveBeenCalledTimes(0);

    auth.status = "signed-in";
    rerender(<TodayTree {...F_TZ} />);
    await waitFor(() => expect(mocks.refreshAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(balanceSpy).toHaveBeenCalledTimes(2));
    await macrotask();
    rerender(<TodayTree {...F_TZ} />);
    await macrotask();
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);

    // A status that flaps back and forth still gets no second refresh in this mount.
    auth.status = "stale";
    rerender(<TodayTree {...F_TZ} />);
    auth.status = "signed-in";
    rerender(<TodayTree {...F_TZ} />);
    await macrotask();
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
    expect(balanceSpy).toHaveBeenCalledTimes(2);
  });

  it("the cap: a hanging refresh recomputes exactly once, at 3 000 ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    online = true;
    mocks.refreshAll.mockReturnValue(never());
    renderToday(F_TZ);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // The cached render is on screen well before 3 s.
    expect(tile("chest")).toBe("0 / 20");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(balanceSpy).toHaveBeenCalledTimes(1);
    for (const fn of [
      mocks.loadEngineHistory,
      mocks.loadTargets,
      mocks.loadLibrary,
      mocks.loadProfile,
    ]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(balanceSpy).toHaveBeenCalledTimes(2);
    for (const fn of [
      mocks.loadEngineHistory,
      mocks.loadTargets,
      mocks.loadLibrary,
      mocks.loadProfile,
    ]) {
      expect(fn).toHaveBeenCalledTimes(2);
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(balanceSpy).toHaveBeenCalledTimes(2);
    expect(mocks.refreshAll).toHaveBeenCalledTimes(1);
  });

  it("a rejected refresh keeps the cached render, with no alert and no unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      online = true;
      mocks.refreshAll.mockRejectedValue(new Error("refresh failed"));
      renderToday(F_TZ);
      await waitFor(() => expect(balanceSpy).toHaveBeenCalledTimes(2));
      await macrotask();
      expect(tile("chest")).toBe("0 / 20");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(part("start")).not.toBeNull();
      expect(unhandled).toHaveBeenCalledTimes(0);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("AC-9 offline status", () => {
  it("offline with lastSyncedAt 08:15Z: 'Offline · last synced 10:15' (Stockholm)", async () => {
    mocks.lastSyncedAt.mockResolvedValue("2026-09-27T08:15:00Z");
    renderToday(F_TZ);
    expect(await screen.findByText("Offline · last synced 10:15")).toBeInTheDocument();
    expect(screen.queryByText("Offline · not synced yet")).toBeNull();
  });

  it("offline with lastSyncedAt null: 'Offline · not synced yet'", async () => {
    renderToday(F_TZ);
    expect(await screen.findByText("Offline · not synced yet")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("last synced");
  });

  it("online: neither text is in the DOM", async () => {
    online = true;
    mocks.lastSyncedAt.mockResolvedValue("2026-09-27T08:15:00Z");
    renderToday(F_TZ);
    await waitForTiles();
    await macrotask();
    expect(document.body.textContent).not.toContain("Offline");
  });
});

describe("AC-10 no profile or targets", () => {
  async function expectNoPlan(): Promise<void> {
    expect(await screen.findByText("Connect to finish setting up your plan")).toBeInTheDocument();
    expect(document.querySelector('[data-component="C-01"]')).toBeNull();
    expect(part("attention")).toBeNull();
    expect(screen.queryByRole("link", { name: "Start workout" })).toBeNull();
    expect(balanceSpy).toHaveBeenCalledTimes(0);
  }

  it("loadProfile() null", async () => {
    mocks.loadProfile.mockResolvedValue(null);
    renderToday(F_TZ);
    await expectNoPlan();
  });

  it("8 targets", async () => {
    mocks.loadTargets.mockResolvedValue(targets(AREA_ORDER.slice(0, 8)));
    renderToday(F_TZ);
    await expectNoPlan();
  });

  it("recovery: an online refresh that fills the profile and 9 targets brings back the render", async () => {
    online = true;
    mocks.loadProfile.mockResolvedValueOnce(null).mockResolvedValue(PROFILE);
    mocks.loadTargets
      .mockResolvedValueOnce(targets(AREA_ORDER.slice(0, 8)))
      .mockResolvedValue(targets());
    renderToday(F_TZ);
    await waitForTiles();
    expect(document.querySelector('[data-component="C-01"]')).not.toBeNull();
    expect(screen.queryByText("Connect to finish setting up your plan")).toBeNull();
    expect(balanceSpy).toHaveBeenCalledTimes(1);
  });

  it("present: profile + 9 targets, the message is absent", async () => {
    renderToday(F_TZ);
    await waitForTiles();
    expect(screen.queryByText("Connect to finish setting up your plan")).toBeNull();
  });

  it("a rejecting loadTargets gives the same message, with no uncaught error", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      mocks.loadTargets.mockRejectedValue(new Error("idb broke"));
      renderToday(F_TZ);
      await expectNoPlan();
      await macrotask();
      expect(unhandled).toHaveBeenCalledTimes(0);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("AC-12 first paint (jsdom)", () => {
  it("the h1 is already in the DOM when balance is first called", async () => {
    const h1AtFirstCall: boolean[] = [];
    balanceSpy.mockImplementation((...args) => {
      h1AtFirstCall.push(document.querySelector('[data-screen-id="UF-02.1"] h1') !== null);
      return realEngine.balance(...args);
    });
    render(<TodayTree {...F_TZ} />);
    await waitForTiles();
    expect(h1AtFirstCall[0]).toBe(true);
  });
});
