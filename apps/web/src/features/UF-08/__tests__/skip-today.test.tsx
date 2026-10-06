// T-0520 UF-08.1 / UF-08.2 "Skip today" (D-0191 §1, §2, GitHub #33): nine toggle chips feed
// `SessionInput.avoidAreas` (engine rule 6.1, R6-E3) into the fit line, Suggest and every
// UF-08.2 re-suggest. Loaders mocked; the real engine runs behind a spy that wraps it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest, type Area, type Workout } from "@workoutlab/engine";
import { fLibrary } from "./fixtures.js";
import { fitLine, renderSetup, screenIds, serveCache, setOnline, settle } from "./harness.js";

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
const ORDER = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Core",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
];
const LEGS = ["Glutes", "Quads", "Hamstrings", "Calves"];
const LEG_AREAS: Area[] = ["glutes", "quads", "hamstrings", "calves"];

beforeEach(async () => {
  auth.status = "signed-in";
  const actual = await vi.importActual<typeof import("@workoutlab/engine")>("@workoutlab/engine");
  spy.mockReset();
  spy.mockImplementation(actual.suggest);
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const group = () => screen.getByRole("group", { name: "Skip today" });
const area = (name: string) => within(group()).getByRole("button", { name });
const press = (...names: string[]) => names.forEach((n) => fireEvent.click(area(n)));
const button = (name: string) => screen.getByRole("button", { name });
const lastInput = () => spy.mock.lastCall![4];
const lastWorkout = () => spy.mock.results.at(-1)!.value as Workout;
const skipping = () => document.querySelector('[data-part="skipping"]');
const lib = new Map(fLibrary().map((e) => [e.id, e]));
const legRows = (w: Workout) =>
  w.plan.items.filter((i) =>
    LEG_AREAS.some((a) => (lib.get(i.exerciseId)!.areas as Record<string, number>)[a] === 1),
  );

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^(Fits|Nothing)/));
}

async function legsSkipped30(): Promise<void> {
  renderSetup();
  await loaded();
  fireEvent.click(button("30 minutes"));
  press(...LEGS);
  await settle();
}

describe("AC1 default", () => {
  it("nine unpressed buttons in the fixed order, helper line, no avoidAreas, today's plan", async () => {
    renderSetup();
    await loaded();
    expect(screen.getByText("Sore or busy? Skipped areas stay out of this workout.")).toBeTruthy();
    const buttons = within(group()).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(ORDER);
    expect(buttons.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(lastInput()).not.toHaveProperty("avoidAreas");
    fireEvent.click(button("30 minutes"));
    expect(fitLine()).toHaveTextContent(/^Fits: 3 exercises, 9 sets \+ warm-up$/);
    expect(lastWorkout().plan.items.map((i) => i.exerciseId)).toEqual([
      "bench-press",
      "inverted-row",
      "leg-extension",
    ]);
  });
});

describe("AC2 the fit line follows the choice", () => {
  it("avoidAreas in fixed order whatever the tap order; the R6-E3 plan", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("30 minutes"));
    press("Calves", "Glutes", "Hamstrings", "Quads");
    await settle();
    expect(lastInput()).toMatchObject({ avoidAreas: LEG_AREAS });
    expect(lastWorkout().plan.items.map((i) => [i.exerciseId, i.sets])).toEqual([
      ["bench-press", 4],
      ["inverted-row", 3],
      ["lateral-raise", 2],
    ]);
    expect(fitLine()).toHaveTextContent(/^Fits: 3 exercises, 9 sets \+ warm-up$/);
    expect(area("Quads")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AC3 Suggest hands it over", () => {
  it("no leg row, no new call, and the Skipping today line", async () => {
    await legsSkipped30();
    const calls = spy.mock.calls.length;
    const handed = lastWorkout();
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    await settle();
    expect(spy.mock.calls.length).toBe(calls);
    expect(legRows(handed)).toEqual([]);
    expect(document.querySelectorAll('[data-part="item-row"]').length).toBe(3);
    expect(skipping()).toHaveTextContent("Skipping today: Glutes, Quads, Hamstrings, Calves");
  });
});

describe("AC4 re-suggests keep it", () => {
  it("Shuffle and the 45 chip both carry avoidAreas; no leg row", async () => {
    await legsSkipped30();
    fireEvent.click(button("Suggest my workout"));
    const base = spy.mock.calls.length;
    fireEvent.click(button("Shuffle"));
    expect(spy.mock.calls.length).toBe(base + 1);
    expect(lastInput()).toMatchObject({ avoidAreas: LEG_AREAS, shuffle: 1 });
    expect(legRows(lastWorkout())).toEqual([]);
    fireEvent.click(button("45 minutes"));
    expect(spy.mock.calls.length).toBe(base + 2);
    expect(lastInput()).toMatchObject({ avoidAreas: LEG_AREAS, budgetMin: 45 });
    expect(legRows(lastWorkout())).toEqual([]);
    expect(skipping()).toHaveTextContent("Skipping today: Glutes, Quads, Hamstrings, Calves");
  });
});

describe("AC5 Back keeps it, a remount clears it", () => {
  it("Back to UF-08.1 shows the chips still pressed and the fit line uses them", async () => {
    await legsSkipped30();
    fireEvent.click(button("Suggest my workout"));
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    for (const n of LEGS) expect(area(n)).toHaveAttribute("aria-pressed", "true");
    await loaded();
    expect(lastInput()).toMatchObject({ avoidAreas: LEG_AREAS });
  });

  it("a fresh mount has none pressed", async () => {
    renderSetup();
    await loaded();
    for (const n of ORDER) expect(area(n)).toHaveAttribute("aria-pressed", "false");
  });
});

describe("AC6 toggle off", () => {
  it("a second press unpresses Quads and the next call drops it", async () => {
    renderSetup();
    await loaded();
    press("Quads");
    expect(lastInput()).toMatchObject({ avoidAreas: ["quads"] });
    press("Quads");
    expect(area("Quads")).toHaveAttribute("aria-pressed", "false");
    expect(lastInput().avoidAreas ?? []).not.toContain("quads");
  });
});

describe("AC7 all nine", () => {
  it("fit line says nothing fits, Suggest still works, UF-08.2 shows the empty plan", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("30 minutes"));
    press(...ORDER);
    expect(fitLine()).toHaveTextContent("Nothing fits in 30 min");
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(document.querySelector('[data-part="nothing-fits"]')).toHaveTextContent(
      "Nothing fits in 30 min",
    );
  });
});

describe("AC8 no line when empty", () => {
  it("UF-08.2 has no skipping element with nothing pressed", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(skipping()).toBeNull();
  });
});

describe("AC9 offline and online", () => {
  it.each([false, true])(
    "navigator.onLine = %s: the chips work and the plan is built here",
    async (online) => {
      setOnline(online);
      renderSetup();
      await loaded();
      fireEvent.click(button("30 minutes"));
      press(...LEGS);
      await settle();
      expect(lastInput()).toMatchObject({ avoidAreas: LEG_AREAS });
      expect(legRows(lastWorkout())).toEqual([]);
      expect(fitLine()).toHaveTextContent(/^Fits: 3 exercises, 9 sets \+ warm-up$/);
    },
  );
});

describe("AC10 order and touch targets", () => {
  it("time stepper and chips come before the group in DOM order", async () => {
    renderSetup();
    await loaded();
    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>("button, input, a[href]"),
    );
    const idx = (el: HTMLElement) => interactive.indexOf(el);
    expect(idx(button("5 minutes less"))).toBeLessThan(idx(area("Chest")));
    expect(idx(button("30 minutes"))).toBeLessThan(idx(area("Chest")));
    expect(idx(screen.getByRole("radio", { name: "Low" }))).toBeLessThan(idx(area("Chest")));
    expect(idx(area("Calves"))).toBeLessThan(idx(button("Suggest my workout")));
  });

  it("each skip chip is at least 44 x 44 px in the stylesheet", () => {
    const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
    const m = /\.wl-uf08__chip,\s*\.wl-uf08__skip-chip\s*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/min-width:\s*44px/);
    expect(m![1]).toMatch(/min-height:\s*44px/);
  });
});
