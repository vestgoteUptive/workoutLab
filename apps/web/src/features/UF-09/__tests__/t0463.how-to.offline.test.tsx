// T-0463 AC-1/AC-2 (offline) (UF-09.9, UF-04, D-0167): Try again offline fails again, with both buttons; Close returns.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "./fixtures.js";
import {
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
vi.mock("../../UF-04/index.js", async () => {
  loader.calls += 1;
  if (loader.failing) {
    throw new Error("Failed to fetch dynamically imported module: /assets/index-stale.js");
  }
  const { useEffect } = await import("react");
  return {
    ExerciseHowTo: ({ exerciseId }: { exerciseId: string }) => {
      useEffect(() => {
        loader.mounts += 1;
      }, []);
      return <div data-testid="howto-stub">{exerciseId}</div>;
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

const stub = () => screen.queryByTestId("howto-stub");

describe("T-0463 how-to: Try again offline", () => {
  it("shows Try again + Close (focus on Close); fails again with both buttons; Close returns; nothing unhandled", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    await renderPaused();
    const before = storedFocus();
    await openSettled("How to");
    expect(dialog()).toHaveTextContent(FAIL);
    expect(buttons()).toEqual(["Try again", "Close"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    const failedCalls = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flushReal();
    await findEl(() => (loader.calls > failedCalls ? dialog() : null));
    await flushReal();
    expect(loader.calls).toBe(failedCalls + 1);
    expect(dialog()).toHaveTextContent(FAIL);
    expect(buttons()).toEqual(["Try again", "Close"]);
    expect(stub()).toBeNull();
    await click("Close");
    expect(screenId()).toBe("UF-09.9");
    expect(storedFocus()).toEqual(before);
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    for (const args of vi.mocked(console.error).mock.calls) {
      expect(args.map(String).join(" ")).toMatch(/Failed to fetch|error occurred|SeamBoundary/);
    }
  });
});
