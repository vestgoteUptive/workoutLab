// T-0303a UF-08.1 AC-7 (loading, D-0107 §7) and AC-8 (hand-off to ?step=suggested, D-0107 §2).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest, type Workout } from "@workoutlab/engine";
import { Suggested } from "../Suggested.js";
import {
  fitLine,
  hangLoaders,
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
// The placeholder wrapped in a recorder, so AC-8 can check the `workout` prop's identity.
vi.mock("../Suggested.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../Suggested.js")>();
  return { Suggested: vi.fn(actual.Suggested) };
});

const spy = vi.mocked(suggest);
const placeholder = vi.mocked(Suggested);

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(false);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });

describe("AC-7 before data", () => {
  it("every control is rendered and operable; the line reads 'Checking what fits…'", () => {
    hangLoaders();
    renderSetup();
    expect(fitLine()).toHaveTextContent("Checking what fits…");

    fireEvent.click(button("5 minutes more"));
    expect(minutes()).toBe("50");
    fireEvent.click(button("5 minutes less"));
    expect(minutes()).toBe("45");
    fireEvent.click(button("30 minutes"));
    expect(pressedChips()).toEqual(["30"]);
    const toggle = screen.getByRole("checkbox");
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(screen.getByRole("radio", { name: "High" })).toBeChecked();
    expect(spy).not.toHaveBeenCalled();
  });

  it("Suggest is aria-disabled and activating it leaves the location unchanged", async () => {
    hangLoaders();
    renderSetup();
    const go = button("Suggest my workout");
    expect(go).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(go);
    await settle();
    expect(location()).toEqual({ pathname: "/session/setup", search: "", type: "POP" });
    expect(screenIds()).toEqual(["UF-08.1"]);
  });

  it("after data: the button is enabled", async () => {
    renderSetup();
    await waitFor(() =>
      expect(button("Suggest my workout")).toHaveAttribute("aria-disabled", "false"),
    );
    expect(fitLine().textContent).toMatch(/^Fits: /);
  });
});

describe("AC-8 hand-off", () => {
  async function chooseAndSuggest(): Promise<Workout> {
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    fireEvent.click(button("30 minutes"));
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    fireEvent.click(screen.getByRole("checkbox"));
    const last = spy.mock.results.at(-1)!.value as Workout;
    fireEvent.click(button("Suggest my workout"));
    return last;
  }

  it("Suggest PUSHes ?step=suggested and renders UF-08.2 with the last Workout (same reference)", async () => {
    const last = await chooseAndSuggest();
    expect(location()).toEqual({
      pathname: "/session/setup",
      search: "?step=suggested",
      type: "PUSH",
    });
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your workout");
    expect(placeholder).toHaveBeenCalled();
    expect(placeholder.mock.lastCall![0].workout).toBe(last);
  });

  it("navigating makes no extra suggest call", async () => {
    renderSetup();
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    await settle();
    const calls = spy.mock.calls.length;
    fireEvent.click(button("Suggest my workout"));
    await settle();
    expect(screenIds()).toEqual(["UF-08.2"]);
    expect(spy.mock.calls.length).toBe(calls);
  });

  it("Back goes to ?step=time with 30 min, Low and warm-up off still selected, without a remount", async () => {
    await chooseAndSuggest();
    await settle();
    // Mount probe: the host reads each loader once per mount (offline, so no re-read).
    expect(loaderReads()).toEqual([1, 1, 1, 1]);

    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(location()).toEqual({ pathname: "/session/setup", search: "?step=time", type: "PUSH" });
    expect(screenIds()).toEqual(["UF-08.1"]);
    expect(minutes()).toBe("30");
    expect(pressedChips()).toEqual(["30"]);
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    await settle();
    expect(loaderReads()).toEqual([1, 1, 1, 1]);
  });

  it("exactly one [data-screen-id] at every step", async () => {
    renderSetup();
    expect(screenIds()).toHaveLength(1);
    await waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));
    expect(screenIds()).toEqual(["UF-08.1"]);
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(screenIds()).toEqual(["UF-08.1"]);
  });
});
