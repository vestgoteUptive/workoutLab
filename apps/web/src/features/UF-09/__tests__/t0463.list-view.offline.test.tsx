// T-0463 AC-1/AC-2 (offline) (UF-09.9, UF-03.1, D-0167): Try again offline fails again, with both buttons; Close returns.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "./fixtures.js";
import {
  advance,
  flushReal,
  freshDb,
  screenId,
  seedSession,
  signIn,
  storedFocus,
  useFakeClock,
} from "./helpers.js";
import {
  FAIL,
  NOW,
  buttons,
  click,
  dialog,
  findEl,
  openSettled,
  renderPaused,
} from "./t0463-fixtures.js";

const loader = vi.hoisted(() => ({ calls: 0, failing: true, mounts: 0 }));

// The factory runs on every import that isn't cached: a throw is a rejected import (a 404 chunk).
vi.mock("../../UF-03/index.js", async () => {
  loader.calls += 1;
  if (loader.failing) {
    throw new Error("Failed to fetch dynamically imported module: /assets/index-stale.js");
  }
  const { useEffect } = await import("react");
  return {
    ListView: ({ ctx }: { ctx: { currentItemIndex: number } }) => {
      useEffect(() => {
        loader.mounts += 1;
      }, []);
      return <div data-testid="list-stub">item {ctx.currentItemIndex}</div>;
    },
  };
});

beforeEach(async () => {
  loader.calls = 0;
  loader.mounts = 0;
  loader.failing = true;
  window.localStorage.clear();
  freshDb();
  useFakeClock(NOW);
  signIn(USER_A);
  await seedSession();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const stub = () => screen.queryByTestId("list-stub");

describe("T-0463 list-view: Try again offline", () => {
  it("shows Try again + Close (focus on Close); fails again with both buttons; Close returns; nothing unhandled", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    await renderPaused();
    const before = storedFocus();
    await openSettled("List view");
    expect(dialog()).toHaveTextContent(FAIL);
    expect(dialog()).toHaveAttribute("data-screen-id", "UF-03.1");
    expect(buttons()).toEqual(["Try again", "Close"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    // The clocks keep running while it is failed and while it retries (D-0142 §8).
    expect(storedFocus()!["phase"]).not.toBe("paused");
    await advance(5000);
    const failedCalls = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushReal();
    await findEl(() => (loader.calls > failedCalls ? dialog() : null));
    await flushReal();
    expect(loader.calls).toBe(failedCalls + 1);
    expect(dialog()).toHaveTextContent(FAIL);
    expect(dialog()).toHaveAttribute("data-screen-id", "UF-03.1");
    expect(buttons()).toEqual(["Try again", "Close"]);
    expect(stub()).toBeNull();
    await click("Close");
    expect(screenId()).toBe("UF-09.3");
    expect(storedFocus()).toMatchObject({ phase: "set", loggedSets: before!["loggedSets"] });
    // 20:00 at the open plus the 5 s that ran across the failure and the retry.
    await click("Pause workout");
    expect(document.querySelector('[data-field="elapsed"]')).toHaveTextContent("20:05");
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    for (const args of vi.mocked(console.error).mock.calls) {
      expect(args.map(String).join(" ")).toMatch(/Failed to fetch|error occurred|SeamBoundary/);
    }
  });
});
