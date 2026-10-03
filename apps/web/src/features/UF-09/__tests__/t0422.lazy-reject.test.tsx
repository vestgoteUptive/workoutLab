// T-0422 attempt 3 (review): a rejected lazy import of UF-05.1 is caught by the seam's own error
// boundary. The overlay shows a way back (ctx.close), and the host stays mounted.
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

// The UF-05 chunk fails to load (a stale deploy whose hashed chunk now 404s).
vi.mock("../../UF-05/index.js", () => {
  throw new Error("Failed to fetch dynamically imported module: /assets/index-stale.js");
});

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

describe("T-0422 attempt 3 the lazy SwapSheet (reject)", () => {
  it("a rejected UF-05 import shows the fallback; its Close returns to UF-09.9 with the state unchanged", async () => {
    seedFocus(NOW, { phase: "paused", resumePhase: "set", pausedAtMs: NOW, itemIndex: 1 });
    await renderSession({ locale: "en-GB", timeZone: "UTC" });
    expect(screenId()).toBe("UF-09.9");
    const before = storedFocus();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await flushReal();
    const dialog = await findEl(() => screen.queryByRole("dialog"));
    expect(dialog).toHaveTextContent("Couldn't load alternatives.");
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
