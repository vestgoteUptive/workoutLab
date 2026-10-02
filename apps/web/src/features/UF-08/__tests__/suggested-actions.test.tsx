// T-0303b UF-08.2 through the host: AC-1 (hand-off in, frozen at Suggest), AC-5 (Remove and
// Shuffle re-suggest), AC-6 (time chips keep the main lift, R7-E5), AC-8 (hand-off out, Back),
// AC-9 (offline = online, no fetch) and AC-10 (focus after Remove/Shuffle through the host).
//
// The "no extra call" asserts must fail on the planted fault named in the ticket: a `useEffect`
// that re-suggests on mount (build log in the ticket's accept log).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest, type SessionInput, type Workout } from "@workoutlab/engine";
import { refreshAll } from "../../../lib/offline/history.js";
import { Ready } from "../Ready.js";
import { Suggested } from "../Suggested.js";
import { NOW, TZ, fLibrary, fProfile, fTargets } from "./fixtures.js";
import {
  fCache,
  fitLine,
  loaderReads,
  location,
  minutes,
  pressedChips,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";
import { wR7E4 } from "./workouts.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
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
// Recorders around the real components, so the `workout` prop's identity can be checked.
vi.mock("../Suggested.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Suggested.js")>();
  return { Suggested: vi.fn(actual.Suggested) };
});
vi.mock("../Ready.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Ready.js")>();
  return { Ready: vi.fn(actual.Ready) };
});

const spy = vi.mocked(suggest);
const suggestedView = vi.mocked(Suggested);
const readyView = vi.mocked(Ready);
const refresh = vi.mocked(refreshAll);

beforeEach(() => {
  auth.status = "signed-in";
  vi.clearAllMocks();
  refresh.mockImplementation(async () => {});
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const calls = () => spy.mock.calls.length;
const lastInput = () => spy.mock.lastCall![4];
const lastResult = () => spy.mock.results.at(-1)!.value as Workout;
const shownWorkout = () => suggestedView.mock.lastCall![0].workout;

const rowTexts = () =>
  Array.from(document.querySelectorAll('[data-part="item-row"]')).map((r) => [
    r.querySelector('[data-part="row-name"]')!.textContent,
    r.querySelector('[data-part="row-detail"]')!.textContent,
  ]);
const rowNames = () => rowTexts().map(([n]) => n);

/** A direct engine call with the zero-history F-web inputs. */
function direct(input: SessionInput): Workout {
  return suggest([], fTargets(), fProfile(), fLibrary(), input, new Date(NOW).toISOString(), TZ);
}

function input(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    budgetMin: 30,
    warmupInBudget: true,
    energy: "normal",
    shuffle: 0,
    mainLiftId: "bench-press",
    pinnedIds: [],
    excludeIds: [],
    ...overrides,
  };
}

/** UF-08.1 → chip 30 → Suggest. Returns UF-08.1's last Workout and the call count at Suggest. */
async function toSuggested(): Promise<{ handed: Workout; base: number }> {
  renderSetup();
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
  fireEvent.click(button("30 minutes"));
  await settle();
  const handed = lastResult();
  const base = calls();
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  return { handed, base };
}

describe("AC-1 hand-off in (D-0107 §2, D-0109 §1)", () => {
  it("UF-08.2 renders the Workout UF-08.1 last returned, with no extra call after 50 ms", async () => {
    const { handed, base } = await toSuggested();
    expect(shownWorkout()).toBe(handed);
    await settle();
    expect(calls()).toBe(base);
    expect(shownWorkout()).toBe(handed);
  });

  it("one screen: exactly UF-08.2 with the h1 'Your workout'", async () => {
    await toSuggested();
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Your workout$/);
  });

  it("the real 30-min zero-history plan is W-R7E4 (the example lists fewer reasons)", async () => {
    const { handed } = await toSuggested();
    const noReasons = (w: Workout) => ({
      ...w,
      plan: { ...w.plan, items: w.plan.items.map((i) => ({ ...i, reasons: [] })) },
    });
    expect(noReasons(handed)).toEqual(noReasons(wR7E4()));
    expect(rowNames()).toEqual(["Bench press", "Inverted row", "Leg extension"]);
  });
});

describe("AC-1 frozen at Suggest (T-0303a review)", () => {
  // A re-read with changed content: no equipment gives the R7-E6 push-up plan instead.
  const changed = () => fCache({ profile: fProfile({ equipment: [] }) });

  function controlledRefresh(): () => void {
    let release: () => void = () => {};
    refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    return () => release();
  }

  it("before Suggest: a changed re-read updates the fit line", async () => {
    setOnline(true);
    let content = fCache();
    serveCache(() => content);
    const release = controlledRefresh();
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    const before = fitLine().textContent;
    content = changed();
    release();
    await waitFor(() => expect(loaderReads()).toEqual([2, 2, 2, 2]));
    await waitFor(() => expect(fitLine().textContent).not.toBe(before));
    expect(fitLine().textContent).toMatch(/^Fits: /);
  });

  it("after Suggest: a changed re-read leaves the UF-08.2 plan as handed over", async () => {
    setOnline(true);
    let content = fCache();
    serveCache(() => content);
    const release = controlledRefresh();
    const { handed, base } = await toSuggested();
    const rowsBefore = rowTexts();
    content = changed();
    release();
    await waitFor(() => expect(loaderReads()).toEqual([2, 2, 2, 2]));
    await settle();
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(shownWorkout()).toBe(handed);
    expect(rowTexts()).toEqual(rowsBefore);
    expect(calls()).toBe(base);
  });
});

describe("AC-5 Remove and Shuffle go through the engine (D-0065 §4, D-0109 §2)", () => {
  it("Remove an accessory: one call with excludeIds [inverted-row], rendering its return", async () => {
    const { base } = await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    expect(calls()).toBe(base + 1);
    expect(lastInput()).toEqual(input({ excludeIds: ["inverted-row"] }));
    expect(shownWorkout()).toBe(lastResult());
    expect(rowNames()).not.toContain("Inverted row");
    await settle();
    expect(calls()).toBe(base + 1);
    // The direct call goes through the same spy, so it comes after the count asserts.
    expect(shownWorkout()).toEqual(direct(input({ excludeIds: ["inverted-row"] })));
  });

  it("a second Remove appends to excludeIds in tap order", async () => {
    const { base } = await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    const second = rowNames().find((n) => n !== "Bench press")!;
    const secondId = fLibrary().find((e) => e.name === second)!.id;
    fireEvent.click(button(`Remove ${second}`));
    expect(calls()).toBe(base + 2);
    expect(lastInput().excludeIds).toEqual(["inverted-row", secondId]);
  });

  it("Remove the main lift passes mainLiftId null; an accessory Remove passes bench-press", async () => {
    const { base } = await toSuggested();
    fireEvent.click(button("Remove Bench press"));
    expect(calls()).toBe(base + 1);
    expect(lastInput()).toEqual(input({ mainLiftId: null, excludeIds: ["bench-press"] }));
    expect(rowNames()).not.toContain("Bench press");
  });

  it("contrast: an accessory Remove passes mainLiftId bench-press", async () => {
    await toSuggested();
    fireEvent.click(button("Remove Leg extension"));
    expect(lastInput().mainLiftId).toBe("bench-press");
  });

  it("Shuffle passes 1, 2, 3 and keeps excludeIds and the current main lift", async () => {
    const { base } = await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    for (const n of [1, 2, 3]) {
      const main = shownWorkout().plan.mainLiftId;
      fireEvent.click(button("Shuffle"));
      expect(calls()).toBe(base + 1 + n);
      expect(lastInput()).toEqual(
        input({ shuffle: n, mainLiftId: main, excludeIds: ["inverted-row"] }),
      );
      expect(shownWorkout()).toBe(lastResult());
    }
    await settle();
    expect(calls()).toBe(base + 4);
  });

  it("a Remove or a time chip between Shuffles doesn't reset the count", async () => {
    await toSuggested();
    fireEvent.click(button("Shuffle"));
    expect(lastInput().shuffle).toBe(1);
    fireEvent.click(button("45 minutes"));
    expect(lastInput()).toMatchObject({ budgetMin: 45, shuffle: 1 });
    fireEvent.click(button("Shuffle"));
    expect(lastInput().shuffle).toBe(2);
    const accessory = rowNames().find((n) => n !== rowNames()[0])!;
    fireEvent.click(button(`Remove ${accessory}`));
    expect(lastInput().shuffle).toBe(2);
    fireEvent.click(button("Shuffle"));
    expect(lastInput().shuffle).toBe(3);
  });

  it("every action is exactly one call (+1 per tap, +0 after 50 ms)", async () => {
    const { base } = await toSuggested();
    const taps = [
      () => fireEvent.click(button("Shuffle")),
      () => fireEvent.click(button("20 minutes")),
      () => fireEvent.click(button(`Remove ${rowNames().at(-1)!}`)),
    ];
    let expected = base;
    for (const tap of taps) {
      tap();
      expected += 1;
      expect(calls()).toBe(expected);
      await settle();
      expect(calls()).toBe(expected);
    }
  });
});

describe("AC-6 time chips keep the main lift (R7-E5, D-0109 §3)", () => {
  it("at 30 exactly the 30 chip is pressed in the Time group", async () => {
    await toSuggested();
    expect(screen.getByRole("group", { name: "Time" })).toBeInTheDocument();
    expect(pressedChips()).toEqual(["30"]);
  });

  it("budgetMin 50 set on UF-08.1 → no chip pressed on UF-08.2", async () => {
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    fireEvent.click(button("5 minutes more"));
    expect(minutes()).toBe("50");
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(pressedChips()).toEqual([]);
  });

  it("chip 20: one call with budgetMin 20 and mainLiftId bench-press; bench + straight-arm pulldown", async () => {
    const { base } = await toSuggested();
    fireEvent.click(button("20 minutes"));
    expect(calls()).toBe(base + 1);
    expect(lastInput()).toEqual(input({ budgetMin: 20 }));
    const rows = rowTexts();
    expect(rows.map(([n]) => n)).toEqual(["Bench press", "Straight arm pulldown"]);
    expect(rows[0]![1]).toMatch(/^4 × 6–8 · /);
    expect(rows[1]![1]).toMatch(/^2 × 10–15 · /);
    expect(pressedChips()).toEqual(["20"]);
    await settle();
    expect(calls()).toBe(base + 1);
  });

  it("re-pressing the active chip makes no call", async () => {
    const { base } = await toSuggested();
    fireEvent.click(button("30 minutes"));
    await settle();
    expect(calls()).toBe(base);
  });

  it("after chip 20, Back shows UF-08.1 at 20 min", async () => {
    await toSuggested();
    fireEvent.click(button("20 minutes"));
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(minutes()).toBe("20");
    expect(pressedChips()).toEqual(["20"]);
  });
});

describe("AC-8 hand-off out and Back (D-0107 §1)", () => {
  it("Looks good PUSHes ?step=ready with the current Workout, also after a Remove", async () => {
    await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    const current = shownWorkout();
    fireEvent.click(button("Looks good"));
    expect(location()).toEqual({ pathname: "/session/setup", search: "?step=ready", type: "PUSH" });
    expect(screenIds()).toEqual(["UF-08.4"]);
    expect(readyView.mock.lastCall![0].workout).toBe(current);
  });

  it("contrast: Looks good with no action hands over the UF-08.1 Workout", async () => {
    const { handed } = await toSuggested();
    fireEvent.click(button("Looks good"));
    expect(readyView.mock.lastCall![0].workout).toBe(handed);
  });

  it("Back goes to ?step=time with 30, Low, warm-up off still selected, no remount", async () => {
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    fireEvent.click(button("30 minutes"));
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button("Suggest my workout"));
    fireEvent.click(button("Shuffle"));
    await settle();
    expect(loaderReads()).toEqual([1, 1, 1, 1]);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(location()).toEqual({ pathname: "/session/setup", search: "?step=time", type: "PUSH" });
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(minutes()).toBe("30");
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await settle();
    expect(loaderReads()).toEqual([1, 1, 1, 1]);
  });

  it("Back, then Suggest hands over UF-08.1's Workout again; its first Shuffle is 1 with excludeIds []", async () => {
    await toSuggested();
    fireEvent.click(button("Remove Inverted row"));
    fireEvent.click(button("Shuffle"));
    fireEvent.click(button("Shuffle"));
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    const again = lastResult();
    fireEvent.click(button("Suggest my workout"));
    expect(shownWorkout()).toBe(again);
    expect(rowNames()).toContain("Inverted row");
    fireEvent.click(button("Shuffle"));
    expect(lastInput()).toEqual(input({ shuffle: 1 }));
  });

  it("a cold load of ?step=suggested (and ?step=ready) still shows UF-08.1", async () => {
    const view = renderSetup(undefined, "/session/setup?step=suggested");
    await waitFor(() => expect(location().search).toBe(""));
    expect(screenIds()).toEqual(["UF-08.1"]);
    view.unmount();
    renderSetup(undefined, "/session/setup?step=ready");
    await waitFor(() => expect(location().search).toBe(""));
    expect(screenIds()).toEqual(["UF-08.1"]);
  });

  it("no button whose name starts with 'Swap'", async () => {
    await toSuggested();
    expect(screen.queryAllByRole("button", { name: /^Swap/ })).toEqual([]);
  });
});

describe("AC-9 offline = online (NFR-OFF-3, D-0071 §8)", () => {
  async function run(online: boolean) {
    setOnline(online);
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    if (online) await waitFor(() => expect(loaderReads()).toEqual([2, 2, 2, 2]));
    await settle();
    fireEvent.click(button("30 minutes"));
    fireEvent.click(button("Suggest my workout"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fireEvent.click(button("Remove Inverted row"));
    fireEvent.click(button("Shuffle"));
    fireEvent.click(button("45 minutes"));
    await settle();
    const result = { rows: rowTexts(), workout: shownWorkout(), fetches: fetchSpy.mock.calls };
    fetchSpy.mockRestore();
    return result;
  }

  it("the same sequence gives deep-equal rows and Workouts, with no fetch either way", async () => {
    const offline = await run(false);
    document.body.innerHTML = "";
    vi.clearAllMocks();
    refresh.mockImplementation(async () => {});
    serveCache();
    const online = await run(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(online.rows).toEqual(offline.rows);
    expect(online.workout).toEqual(offline.workout);
    expect(offline.fetches).toEqual([]);
    expect(online.fetches).toEqual([]);
    expect(offline.rows.length).toBeGreaterThan(0);
  });
});

describe("AC-10 focus through the host (D-0109 §6)", () => {
  it("removing row 1 of 3 focuses the new row 1's Remove", async () => {
    await toSuggested();
    const first = button("Remove Bench press");
    first.focus();
    fireEvent.click(first);
    const name = rowNames()[0]!;
    expect(button(`Remove ${name}`)).toHaveFocus();
  });

  it("Shuffle keeps focus on Shuffle; a time chip keeps focus on the chip", async () => {
    await toSuggested();
    const shuffle = button("Shuffle");
    shuffle.focus();
    fireEvent.click(shuffle);
    expect(button("Shuffle")).toHaveFocus();
    const chip = button("45 minutes");
    chip.focus();
    fireEvent.click(chip);
    expect(button("45 minutes")).toHaveFocus();
  });
});
