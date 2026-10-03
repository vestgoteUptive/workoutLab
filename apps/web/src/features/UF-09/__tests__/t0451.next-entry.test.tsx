// T-0451 AC-3 (UF-09.6 entry): the same flow as AC-1 from UF-09.6's Swap (nextSeamActions).
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import { flushReal, freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { findEl, seedFocus } from "./set-loop-helpers.js";
import { FAIL, dialog, openSwapSettled, seedSwapCache } from "./t0451-fixtures.js";

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

describe("T-0451 AC-3 the UF-09.6 entry", () => {
  it("Swap from UF-09.6 imports again on the next open after a failure", async () => {
    seedFocus(NOW, {
      phase: "next",
      itemIndex: 1,
      setIndex: 0,
      timer: { startedAtMs: NOW - 10_000, durationS: 60, pausedMs: 0 },
    });
    await renderSession({ locale: "en-GB", timeZone: "UTC" });
    expect(screenId()).toBe("UF-09.6");
    await openSwapSettled();
    expect(dialog()).toHaveTextContent(FAIL);
    const failedCalls = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await flushReal();
    expect(screenId()).toBe("UF-09.6");
    loader.failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await flushReal();
    await findEl(() => screen.queryByRole("dialog", SHEET));
    expect(loader.calls).toBe(failedCalls + 1);
  });
});
