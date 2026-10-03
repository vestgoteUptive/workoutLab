// T-0416 attempt 2 (review): the lazy List view seam's chunk rejects. The overlay shows a placeholder
// with a working Close (D-0142 §8), the host stays mounted, and UF-09.9 returns with the state
// unchanged. The resolved pair (the view renders) is list-view.host.test.tsx in UF-03.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P1, S1, STARTED_AT_MS, USER_A } from "./fixtures.js";
import {
  flushReal,
  freshDb,
  renderLoaded,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import { initialFocusState } from "../machine.js";

vi.mock("../../UF-03/index.js", () => {
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

describe("T-0416 attempt 2 the lazy List view seam (rejects)", () => {
  it("a rejected import shows the error placeholder; Close returns to the focus screen (UF-09.3) with the logged sets unchanged", async () => {
    window.localStorage.setItem(
      `wl-focus:${S1}`,
      JSON.stringify({
        ...initialFocusState(S1, P1, NOW),
        phase: "paused",
        resumePhase: "set",
        pausedAtMs: NOW,
        timer: null,
      }),
    );
    await renderLoaded({ locale: "en-GB", timeZone: "UTC" });
    expect(screenId()).toBe("UF-09.9");
    const before = storedFocus();
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    await flushReal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Couldn't load this view.");
    expect(document.querySelectorAll("a[href]")).toHaveLength(0);
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    await flushReal();
    // Opening the List view resumed the machine (D-0071 §4), so Close lands on the focus
    // screen it paused from, as "Focus mode" does; nothing else in the stored state changed.
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toMatchObject({ phase: "set", loggedSets: before!.loggedSets });
  });
});
