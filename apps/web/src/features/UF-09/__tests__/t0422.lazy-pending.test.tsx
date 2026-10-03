// T-0422 attempt 3 (review): while the lazy UF-05.1 chunk is still loading, the Suspense fallback
// is a real step with a way back (ctx.close), not an empty overlay.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  flushReal,
  freshDb,
  screenId,
  screenIds,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { renderSession } from "./session-helpers.js";
import { findEl, seedFocus } from "./set-loop-helpers.js";

// The UF-05 chunk never arrives (a slow network before the service worker controls the page).
vi.mock("../../UF-05/index.js", () => new Promise(() => undefined));

const NOW = STARTED_AT_MS + 20 * 60_000;

beforeEach(async () => {
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("T-0422 attempt 3 the lazy SwapSheet (pending)", () => {
  it("a pending UF-05 import shows a fallback with a working Close; UF-09.9 comes back with the state unchanged", async () => {
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });
    await renderSession({ locale: "en-GB", timeZone: "UTC" });
    expect(screenId()).toBe("UF-09.9");
    const before = storedFocus();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await flushReal();
    const dialog = await findEl(() => screen.queryByRole("dialog"));
    expect(dialog).toHaveTextContent("Loading alternatives…");
    expect(screenIds()).toEqual(["UF-05.1"]);
    expect(document.querySelectorAll("a[href]")).toHaveLength(0);
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    await flushReal();
    expect(screenId()).toBe("UF-09.9");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(storedFocus()).toEqual(before);
  });
});
