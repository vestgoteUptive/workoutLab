// T-0303a UF-08.1 AC-1 (host and URLs), AC-2 (defaults, stepper, chips), AC-3 (done by),
// AC-4 (finish time) and AC-5 (energy, warm-up toggle). Loaders mocked; the real engine runs
// behind a spy that wraps it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import { formatTime } from "../../../lib/format/intl.js";
import {
  doneBy,
  fitLine,
  hangLoaders,
  location,
  minutes,
  pressedChips,
  renderSetup,
  screenIds,
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

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function chip(m: number): HTMLElement {
  return button(`${m} minutes`);
}

async function loaded(): Promise<void> {
  await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
}

function pressTimes(name: string, n: number): void {
  for (let i = 0; i < n; i += 1) fireEvent.click(button(name));
}

function cssRule(selector: string): string {
  const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(css);
  expect(match, selector).not.toBeNull();
  return match![1]!;
}

function px(rule: string, prop: string): number {
  const m = new RegExp(`(?:^|;|\\s)${prop}:\\s*(\\d+)px`).exec(rule);
  expect(m, prop).not.toBeNull();
  return Number(m![1]);
}

describe("AC-1 host and URLs (D-0107 §1)", () => {
  it("first commit, never-resolving loaders: UF-08.1 is the only screen, with its <h1>", () => {
    hangLoaders();
    renderSetup();
    expect(screenIds()).toEqual(["UF-08.1"]);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("How long do you have?");
    expect(document.querySelector('[data-screen-id="UF-08.1"]')).toContainElement(h1);
  });

  it("?step=time renders the same screen and leaves the URL alone", async () => {
    renderSetup(undefined, "/session/setup?step=time");
    expect(screenIds()).toEqual(["UF-08.1"]);
    await settle();
    expect(location()).toEqual({ pathname: "/session/setup", search: "?step=time", type: "POP" });
  });

  it("contrast: /session/setup with no step stays as it is (POP, no replace)", async () => {
    renderSetup();
    await settle();
    expect(location()).toEqual({ pathname: "/session/setup", search: "", type: "POP" });
  });

  it.each(["suggested", "swap", "ready", "bogus"])(
    "cold ?step=%s renders UF-08.1 and REPLACEs to /session/setup",
    async (step) => {
      renderSetup(undefined, `/session/setup?step=${step}`);
      expect(screenIds()).toEqual(["UF-08.1"]);
      await waitFor(() =>
        expect(location()).toEqual({ pathname: "/session/setup", search: "", type: "REPLACE" }),
      );
      expect(screenIds()).toEqual(["UF-08.1"]);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("How long do you have?");
    },
  );

  it("Close is named Close, is ≥ 44 × 44 px, and lands on /", () => {
    renderSetup();
    const close = screen.getByRole("link", { name: "Close" });
    const rule = cssRule(".wl-uf08__close");
    expect(px(rule, "min-width")).toBeGreaterThanOrEqual(44);
    expect(px(rule, "min-height")).toBeGreaterThanOrEqual(44);
    fireEvent.click(close);
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(location().pathname).toBe("/");
  });

  it("renders no navigation role (no chrome, principle 1)", async () => {
    renderSetup();
    await loaded();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("AC-2 defaults and stepper (D-0065 §2)", () => {
  it("defaults: 45 min, warm-up on, energy Normal", () => {
    renderSetup();
    expect(minutes()).toBe("45");
    expect(
      screen.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Normal" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Low" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "High" })).not.toBeChecked();
  });

  it("+ → 50", () => {
    renderSetup();
    fireEvent.click(button("5 minutes more"));
    expect(minutes()).toBe("50");
  });

  it("− ×7 from 45 → 15; at 15 − is aria-disabled, stays 15 and makes no suggest call", async () => {
    renderSetup();
    await loaded();
    pressTimes("5 minutes less", 5);
    expect(minutes()).toBe("20");
    // Above 15 it isn't disabled.
    expect(button("5 minutes less")).toHaveAttribute("aria-disabled", "false");
    pressTimes("5 minutes less", 2);
    expect(minutes()).toBe("15");
    expect(button("5 minutes less")).toHaveAttribute("aria-disabled", "true");
    await settle();
    const calls = spy.mock.calls.length;
    fireEvent.click(button("5 minutes less"));
    await settle();
    expect(minutes()).toBe("15");
    expect(spy.mock.calls.length).toBe(calls);
  });

  it("+ at 120 is aria-disabled, stays 120 and makes no suggest call; below 120 it isn't", async () => {
    renderSetup();
    await loaded();
    fireEvent.click(chip(90));
    pressTimes("5 minutes more", 5);
    expect(minutes()).toBe("115");
    expect(button("5 minutes more")).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(button("5 minutes more"));
    expect(minutes()).toBe("120");
    expect(button("5 minutes more")).toHaveAttribute("aria-disabled", "true");
    await settle();
    const calls = spy.mock.calls.length;
    fireEvent.click(button("5 minutes more"));
    await settle();
    expect(minutes()).toBe("120");
    expect(spy.mock.calls.length).toBe(calls);
  });

  it.each([20, 30, 45, 60, 90])("chip %i sets the value and is the only pressed chip", (m) => {
    renderSetup();
    fireEvent.click(chip(m));
    expect(minutes()).toBe(String(m));
    expect(pressedChips()).toEqual([String(m)]);
  });

  it("at 50 no chip is pressed; at 45 exactly the 45 chip is", () => {
    renderSetup();
    expect(pressedChips()).toEqual(["45"]);
    fireEvent.click(button("5 minutes more"));
    expect(pressedChips()).toEqual([]);
  });

  it("re-pressing the active chip makes no suggest call; pressing another makes one", async () => {
    renderSetup();
    await loaded();
    await settle();
    const calls = spy.mock.calls.length;
    fireEvent.click(chip(45));
    await settle();
    expect(spy.mock.calls.length).toBe(calls);
    fireEvent.click(chip(30));
    await settle();
    expect(spy.mock.calls.length).toBe(calls + 1);
  });

  it("the stepper buttons are named '5 minutes less' / '5 minutes more'", () => {
    renderSetup();
    expect(button("5 minutes less")).toBeInTheDocument();
    expect(button("5 minutes more")).toBeInTheDocument();
  });
});

describe("AC-3 done by (NFR-I18N-2)", () => {
  it("en-GB at F-tz, 45 min: 'done by 12:45'", () => {
    renderSetup();
    expect(doneBy()).toBe("done by 12:45");
  });

  it("en-US, America/New_York, 90 min: 'done by ' + formatTime(…) = 'done by 1:30 PM'", () => {
    const now = "2026-09-27T12:00:00-04:00";
    renderSetup({ now, locale: "en-US", timeZone: "America/New_York" });
    fireEvent.click(chip(90));
    const expected =
      "done by " +
      formatTime(new Date(new Date(now).getTime() + 90 * 60_000).toISOString(), {
        locale: "en-US",
        timeZone: "America/New_York",
      });
    expect(doneBy()).toBe(expected);
    expect(doneBy().replace(/\u202f/g, " ")).toBe("done by 1:30 PM");
  });

  it("tracks the minutes in the same render: 45 → 50 gives 'done by 12:50'", () => {
    renderSetup();
    fireEvent.click(button("5 minutes more"));
    expect(doneBy()).toBe("done by 12:50");
  });
});

describe("AC-4 finish time (D-0065 §2, D-0107 §6)", () => {
  function openFinish(): HTMLInputElement {
    fireEvent.click(button("Set a finish time"));
    return screen.getByLabelText("Finish by") as HTMLInputElement;
  }

  it("is closed until 'Set a finish time'; then an empty type=time input labelled 'Finish by'", () => {
    renderSetup();
    expect(screen.queryByLabelText("Finish by")).toBeNull();
    const input = openFinish();
    expect(input.type).toBe("time");
    expect(input.value).toBe("");
  });

  it("13:07 → 67 min: closes, 'done by 13:07', no chip pressed, then + → 72", () => {
    renderSetup();
    fireEvent.change(openFinish(), { target: { value: "13:07" } });
    expect(minutes()).toBe("67");
    expect(screen.queryByLabelText("Finish by")).toBeNull();
    expect(doneBy()).toBe("done by 13:07");
    expect(pressedChips()).toEqual([]);
    fireEvent.click(button("5 minutes more"));
    expect(minutes()).toBe("72");
  });

  it.each(["12:00", "11:30"])(
    "%s is rejected: 'Pick a time later today', minutes unchanged, input open, no suggest call",
    async (value) => {
      renderSetup();
      await loaded();
      await settle();
      const calls = spy.mock.calls.length;
      fireEvent.change(openFinish(), { target: { value } });
      expect(screen.getByText("Pick a time later today")).toBeInTheDocument();
      expect(minutes()).toBe("45");
      expect(screen.getByLabelText("Finish by")).toBeInTheDocument();
      await settle();
      expect(spy.mock.calls.length).toBe(calls);
    },
  );

  it("contrast: a valid pick after a rejected one clears the error", () => {
    renderSetup();
    const input = openFinish();
    fireEvent.change(input, { target: { value: "11:30" } });
    expect(screen.getByText("Pick a time later today")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "13:00" } });
    expect(screen.queryByText("Pick a time later today")).toBeNull();
    expect(minutes()).toBe("60");
  });

  it("12:10 → 15 (10 < 15, clamped up)", () => {
    renderSetup();
    fireEvent.change(openFinish(), { target: { value: "12:10" } });
    expect(minutes()).toBe("15");
    expect(doneBy()).toBe("done by 12:15");
  });

  it("23:59 → 120 (clamped), 'done by 14:00'", () => {
    renderSetup();
    fireEvent.change(openFinish(), { target: { value: "23:59" } });
    expect(minutes()).toBe("120");
    expect(doneBy()).toBe("done by 14:00");
  });

  it.each(["1", "13:"])("a partial value (%s) converts nothing and shows no error", (value) => {
    renderSetup();
    const input = openFinish();
    fireEvent.change(input, { target: { value } });
    expect(minutes()).toBe("45");
    expect(screen.queryByText("Pick a time later today")).toBeNull();
    expect(screen.getByLabelText("Finish by")).toBeInTheDocument();
  });
});

describe("AC-5 energy and the warm-up toggle (D-0024, D-0004)", () => {
  const HINTS = {
    Low: "Fewer sets, same weights.",
    Normal: "Your plan as written.",
    High: "Adds a back-off set to the main lift if time allows.",
  } as const;

  it("a radio group named Energy with Low / Normal / High", () => {
    renderSetup();
    const group = screen.getByRole("radiogroup", { name: "Energy" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["low", "normal", "high"]);
    for (const name of ["Low", "Normal", "High"]) {
      expect(within(group).getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  it.each(["Low", "Normal", "High"] as const)(
    "only %s's hint shows when it is selected",
    (name) => {
      renderSetup();
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(screen.getByRole("radio", { name })).toBeChecked();
      for (const [other, hint] of Object.entries(HINTS)) {
        if (other === name) expect(screen.getByText(hint)).toBeInTheDocument();
        else expect(screen.queryByText(hint)).toBeNull();
      }
    },
  );

  it("the toggle is a checkbox, on by default; off → suggest(warmupInBudget: false), on → true", async () => {
    renderSetup();
    await loaded();
    const toggle = screen.getByRole("checkbox", { name: "Warm-up counts in this time (3 min)" });
    expect(toggle).toBeChecked();
    expect(spy.mock.lastCall![4].warmupInBudget).toBe(true);

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(spy.mock.lastCall![4].warmupInBudget).toBe(false);

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(spy.mock.lastCall![4].warmupInBudget).toBe(true);
  });
});
