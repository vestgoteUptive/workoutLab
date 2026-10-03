// T-0451 AC-2 (UF-05.1, D-0162 §3): "Try again" in the failure state. The offline test comes
// first: the second test ends with a successful load, which a resolved lazy keeps.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { findEl, seedFocus } from "./set-loop-helpers.js";
import { FAIL, buttons, dialog, openSwapSettled, seedSwapCache } from "./t0451-fixtures.js";

const loader = vi.hoisted(() => ({ calls: 0, failing: true }));

// The factory runs on every import that isn't cached: a throw is a rejected import (a 404 chunk).
vi.mock("../../UF-05/index.js", async (importActual) => {
  loader.calls += 1;
  if (loader.failing) {
    throw new Error("Failed to fetch dynamically imported module: /assets/index-stale.js");
  }
  return importActual();
});

const NOW = STARTED_AT_MS + 20 * 60_000;
const SHEET = { name: "Replace Barbell row" };

beforeEach(async () => {
  loader.calls = 0;
  loader.failing = true;
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
  await seedSwapCache();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const seedPaused = () =>
  seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });

describe("T-0451 AC-2 Try again", () => {
  it("fails again (offline): both buttons show again; Close returns to UF-09.9; nothing unhandled", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    seedPaused();
    await renderSession({ locale: "en-GB", timeZone: "UTC" });
    const before = storedFocus();
    await openSwapSettled();
    const failedCalls = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushReal();
    await findEl(() => (loader.calls > failedCalls ? dialog() : null));
    await flushReal();
    expect(loader.calls).toBe(failedCalls + 1);
    expect(dialog()).toHaveTextContent(FAIL);
    expect(buttons()).toEqual(["Try again", "Close"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toEqual(before);
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    // Only React's own boundary log is allowed (the error itself, "The above error occurred").
    for (const args of vi.mocked(console.error).mock.calls) {
      expect(args.map(String).join(" ")).toMatch(/Failed to fetch|error occurred|SeamBoundary/);
    }
  });

  it("recovers: Try again then Close, focus on Close; Try again shows the sheet; state unchanged", async () => {
    seedPaused();
    await renderSession({ locale: "en-GB", timeZone: "UTC" });
    const before = storedFocus();
    await openSwapSettled();
    expect(buttons()).toEqual(["Try again", "Close"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    const failedCalls = loader.calls;
    loader.failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushReal();
    await findEl(() => screen.queryByRole("dialog", SHEET));
    expect(loader.calls).toBe(failedCalls + 1);
    expect(storedFocus()).toEqual(before);
  });
});
