// T-0303a UF-08.1 AC-6: the live fit line is the real on-device `suggest()` (principle 3,
// D-0065 §3, D-0107 §3 §5). The spy wraps the real function; only the "Nothing fits" case stubs it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import { fProfile, fTargets, fLibrary, NOW, TZ } from "./fixtures.js";
import {
  fCache,
  fitLine,
  location,
  renderSetup,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

// D-0113: the mount refresh needs a signed-in session. `auth.status` is read on every render.
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

const spy = vi.mocked(suggest);
let realSuggest: typeof suggest;

beforeEach(async () => {
  auth.status = "signed-in";
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  realSuggest = actual.suggest;
  spy.mockReset();
  spy.mockImplementation(realSuggest);
  vi.clearAllMocks();
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const chip = (m: number) => button(`${m} minutes`);
const lastWorkout = (): Workout => spy.mock.results.at(-1)!.value as Workout;

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

// T-0538: with an empty stored list `excludeIds` is `[]`; a non-empty list is pinned in
// excluded-suggest.test.tsx (AC5).
describe("AC-6 the call", () => {
  it("passes (history, targets, profile, library, input, now ISO, tz) to the real suggest", async () => {
    renderSetup();
    await loaded();
    expect(spy).toHaveBeenCalledTimes(1);
    const [history, targets, profile, library, input, now, tz] = spy.mock.calls[0]!;
    expect(history).toEqual([]);
    expect(targets).toEqual(fTargets());
    expect(profile).toEqual(fProfile());
    expect(library).toEqual(fLibrary());
    expect(input).toEqual({
      budgetMin: 45,
      warmupInBudget: true,
      energy: "normal",
      shuffle: 0,
      mainLiftId: null,
      pinnedIds: [],
      excludeIds: [],
      favoriteIds: [],
    });
    expect(now).toBe(new Date(NOW).toISOString());
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(tz).toBe(TZ);
    // The line renders that call's return.
    const w = spy.mock.results[0]!.value as Workout;
    const sets = w.plan.items.reduce((s, i) => s + i.sets + (i.backoff ? 1 : 0), 0);
    expect(fitLine()).toHaveTextContent(
      `Fits: ${w.plan.items.length} exercises, ${sets} sets + warm-up`,
    );
  });

  it("the 7th argument is the timeZone prop (America/New_York)", async () => {
    renderSetup({
      now: "2026-09-27T12:00:00-04:00",
      locale: "en-US",
      timeZone: "America/New_York",
    });
    await loaded();
    expect(spy.mock.calls[0]![6]).toBe("America/New_York");
    expect(spy.mock.calls[0]![5]).toBe("2026-09-27T16:00:00.000Z");
  });

  it.each<[string, () => void, Partial<Workout> | Record<string, unknown>]>([
    ["+", () => fireEvent.click(button("5 minutes more")), { budgetMin: 50 }],
    ["−", () => fireEvent.click(button("5 minutes less")), { budgetMin: 40 }],
    ["chip 30", () => fireEvent.click(chip(30)), { budgetMin: 30 }],
    ["warm-up off", () => fireEvent.click(screen.getByRole("checkbox")), { warmupInBudget: false }],
    ["Low", () => fireEvent.click(screen.getByRole("radio", { name: "Low" })), { energy: "low" }],
    [
      "finish 13:07",
      () => {
        fireEvent.click(button("Set a finish time"));
        fireEvent.change(screen.getByLabelText("Finish by"), { target: { value: "13:07" } });
      },
      { budgetMin: 67 },
    ],
  ])("%s calls suggest exactly once with the new input", async (_name, act, expected) => {
    renderSetup();
    await loaded();
    await settle();
    const calls = spy.mock.calls.length;
    act();
    await settle();
    expect(spy.mock.calls.length).toBe(calls + 1);
    expect(spy.mock.lastCall![4]).toMatchObject(expected);
  });
});

describe("AC-6 real engine, F-web, zero history", () => {
  it("30 min → 'Fits: 3 exercises, 9 sets + warm-up' (R7-E4)", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(chip(30));
    expect(fitLine()).toHaveTextContent(/^Fits: 3 exercises, 9 sets \+ warm-up$/);
    expect(lastWorkout().plan.items.map((i) => [i.exerciseId, i.sets])).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["leg-extension", 2],
    ]);
  });

  it("15 min → 'Fits: 1 exercise, 4 sets + warm-up' (R7-E2, singular)", async () => {
    renderSetup();
    await loaded();
    for (let i = 0; i < 6; i += 1) fireEvent.click(button("5 minutes less"));
    expect(fitLine()).toHaveTextContent(/^Fits: 1 exercise, 4 sets \+ warm-up$/);
  });

  it("30 min + Low → 'Fits: 3 exercises, 8 sets + warm-up' (R7-E11)", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(chip(30));
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(fitLine()).toHaveTextContent(/^Fits: 3 exercises, 8 sets \+ warm-up$/);
  });

  it("15 min + warm-up off + High → 5 sets (R7-E12, the back-off counts); Normal → 4 sets", async () => {
    renderSetup();
    await loaded();
    for (let i = 0; i < 6; i += 1) fireEvent.click(button("5 minutes less"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(fitLine()).toHaveTextContent(/^Fits: 1 exercise, 5 sets \+ warm-up$/);
    expect(lastWorkout().plan.items[0]!.backoff).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Normal" }));
    expect(fitLine()).toHaveTextContent(/^Fits: 1 exercise, 4 sets \+ warm-up$/);
  });

  it("the ' + warm-up' suffix shows with the warm-up both in and out of the budget", async () => {
    renderSetup();
    await loaded();
    expect(fitLine().textContent).toMatch(/ \+ warm-up$/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(fitLine().textContent).toMatch(/ \+ warm-up$/);
  });
});

describe("AC-6 nothing fits", () => {
  it("a stubbed 0-item Workout gives 'Nothing fits in 15 min' and Suggest stays enabled", async () => {
    spy.mockImplementation((...args: Parameters<typeof suggest>) => {
      const w = realSuggest(...args);
      return { ...w, plan: { ...w.plan, items: [] } };
    });
    renderSetup();
    await loaded();
    for (let i = 0; i < 6; i += 1) fireEvent.click(button("5 minutes less"));
    expect(fitLine()).toHaveTextContent(/^Nothing fits in 15 min$/);
    const go = button("Suggest my workout");
    expect(go).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(go);
    expect(location().search).toBe("?step=suggested");
  });

  it("contrast: the same 15 min from the real engine fits one exercise", async () => {
    renderSetup();
    await loaded();
    for (let i = 0; i < 6; i += 1) fireEvent.click(button("5 minutes less"));
    expect(fitLine().textContent).not.toMatch(/^Nothing fits/);
  });
});

describe("AC-6 the goal (D-0095)", () => {
  it("get_stronger reaches suggest, and the 30-min bench-press slot is 3–5 (R7-E14)", async () => {
    serveCache(() => fCache({ profile: fProfile({ goal: "get_stronger" }) }));
    renderSetup();
    await loaded();
    fireEvent.click(chip(30));
    expect(spy.mock.lastCall![2].goal).toBe("get_stronger");
    const bench = lastWorkout().plan.items.find((i) => i.exerciseId === "bench-press")!;
    expect([bench.repsMin, bench.repsMax]).toEqual([3, 5]);
  });

  it("build_muscle gives 6–8", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(chip(30));
    expect(spy.mock.lastCall![2].goal).toBe("build_muscle");
    const bench = lastWorkout().plan.items.find((i) => i.exerciseId === "bench-press")!;
    expect([bench.repsMin, bench.repsMax]).toEqual([6, 8]);
  });
});

describe("AC-6 a11y", () => {
  it("the fit line is aria-live=polite, before and after data", async () => {
    renderSetup();
    expect(fitLine()).toHaveAttribute("aria-live", "polite");
    await loaded();
    expect(fitLine()).toHaveAttribute("aria-live", "polite");
  });
});
