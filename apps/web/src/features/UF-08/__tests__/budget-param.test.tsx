// T-0637 UF-08.1 AC2-AC7: `?budget=N` read once at mount as the initial time budget (D-0217).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import {
  doneBy,
  fitLine,
  minutes,
  pressedChips,
  renderSetup,
  screenIds,
  serveCache,
  setOnline,
  settle,
} from "./harness.js";

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

beforeEach(() => {
  auth.status = "signed-in";
  vi.clearAllMocks();
  setOnline(true);
  serveCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const loaded = () => waitFor(() => expect(fitLine().textContent).toMatch(/^Fits: /));

describe("AC2 initial state from ?budget=20", () => {
  it("20 chip pressed, stepper 20, done by now + 20 min", () => {
    renderSetup(undefined, "/session/setup?budget=20");
    expect(button("20 minutes")).toHaveAttribute("aria-pressed", "true");
    expect(pressedChips()).toEqual(["20"]);
    expect(minutes()).toBe("20");
    expect(doneBy()).toBe("done by 12:20");
  });
});

describe("AC3 a value that is not a chip", () => {
  it("?budget=25: stepper 25, no chip pressed", () => {
    renderSetup(undefined, "/session/setup?budget=25");
    expect(minutes()).toBe("25");
    expect(pressedChips()).toEqual([]);
  });
});

describe("AC4 default kept", () => {
  it.each(["/session/setup", "/session/setup?budget=abc"])("%s → 45, the 45 chip pressed", (at) => {
    renderSetup(undefined, at);
    expect(minutes()).toBe("45");
    expect(pressedChips()).toEqual(["45"]);
  });
});

// The Suggest tap reuses the fit-line result (no second `suggest` call); the input of that one
// call is what both routes must share.
async function suggestInputAfterTap(at: string, chip?: number): Promise<unknown> {
  renderSetup(undefined, at);
  await loaded();
  if (chip) fireEvent.click(button(`${chip} minutes`));
  await settle();
  const calls = spy.mock.calls.length;
  const arg = spy.mock.calls[calls - 1]![4] as { budgetMin: number };
  expect(arg.budgetMin).toBe(20);
  fireEvent.click(button("Suggest my workout"));
  expect(screenIds()).toEqual(["UF-08.2"]);
  await settle();
  expect(spy).toHaveBeenCalledTimes(calls);
  expect(button("20 minutes")).toHaveAttribute("aria-pressed", "true");
  return JSON.parse(JSON.stringify(arg));
}

describe("AC5 / AC7 the normal suggest path", () => {
  it.each([true, false])("online=%s: one suggest call, equal to a 20-chip tap", async (online) => {
    setOnline(online);
    const viaParam = await suggestInputAfterTap("/session/setup?budget=20");
    cleanup();
    vi.clearAllMocks();
    serveCache();
    const viaChip = await suggestInputAfterTap("/session/setup", 20);
    expect(viaParam).toEqual(viaChip);
  });

  it("offline: ?budget=20 shows the 20 chip and 12:20", () => {
    setOnline(false);
    renderSetup(undefined, "/session/setup?budget=20");
    expect(pressedChips()).toEqual(["20"]);
    expect(doneBy()).toBe("done by 12:20");
  });
});

describe("AC6 the user's change wins", () => {
  it("45 chip, UF-08.2 and back keeps 45", async () => {
    renderSetup(undefined, "/session/setup?budget=20");
    await loaded();
    fireEvent.click(button("45 minutes"));
    await settle();
    fireEvent.click(button("Suggest my workout"));
    expect(screenIds()).toEqual(["UF-08.2"]);
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screenIds()).toEqual(["UF-08.1"]));
    expect(minutes()).toBe("45");
    expect(pressedChips()).toEqual(["45"]);
  });
});
