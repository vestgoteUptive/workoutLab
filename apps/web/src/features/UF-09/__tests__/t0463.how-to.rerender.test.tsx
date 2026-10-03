// T-0463 AC-4 (F3) (UF-09.9, UF-04, D-0167): a parent re-render of the open, loaded seam neither re-imports nor remounts it.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "./fixtures.js";
import { advance, flushReal, freshDb, seedSession, signIn, useFakeClock } from "./helpers.js";
import { NOW, click, findEl, hostTree, renderPausedHost, watchFallback } from "./t0463-fixtures.js";

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
  loader.failing = false;
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

describe("T-0463 how-to: a re-render keeps the open view", () => {
  it("the loader calls and the stub's mounts stay at 1 across host re-renders", async () => {
    const view = await renderPausedHost();
    await click("How to");
    await findEl(() => stub());
    expect(loader.calls).toBe(1);
    expect(loader.mounts).toBe(1);
    const watch = watchFallback();
    // The List view's host ticks as its clocks run (D-0142 §8); the how-to's is re-rendered.
    await advance(3000);
    view.rerender(hostTree());
    await flushReal();
    // React throttles the fallback of a suspended re-render by 300 ms: a remount would show here.
    await advance(1000);
    watch.stop();
    expect(watch.seen()).toBe(false);
    expect(stub()).not.toBeNull();
    expect(loader.calls).toBe(1);
    expect(loader.mounts).toBe(1);
  });
});
