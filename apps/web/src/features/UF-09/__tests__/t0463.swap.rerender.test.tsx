// T-0463 AC-4 (F3, UF-05.1, D-0167 §4): a parent re-render of the open, loaded swap sheet neither
// re-imports nor remounts it.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "./fixtures.js";
import { advance, flushReal, freshDb, seedSession, signIn, useFakeClock } from "./helpers.js";
import { NOW, click, watchFallback, findEl, hostTree, renderPausedHost } from "./t0463-fixtures.js";

const loader = vi.hoisted(() => ({ calls: 0, mounts: 0 }));

vi.mock("../../UF-05/index.js", async () => {
  loader.calls += 1;
  const { useEffect } = await import("react");
  return {
    SwapSheet: () => {
      useEffect(() => {
        loader.mounts += 1;
      }, []);
      return <div data-testid="swap-stub" />;
    },
  };
});

beforeEach(async () => {
  loader.calls = 0;
  loader.mounts = 0;
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

describe("T-0463 swap: a re-render keeps the open sheet", () => {
  it("the loader calls and the stub's mounts stay at 1 across host re-renders", async () => {
    const view = await renderPausedHost();
    await click("Swap");
    await findEl(() => screen.queryByTestId("swap-stub"));
    expect(loader.calls).toBe(1);
    expect(loader.mounts).toBe(1);
    const watch = watchFallback();
    await advance(3000);
    view.rerender(hostTree());
    await flushReal();
    // React throttles the fallback of a suspended re-render by 300 ms: a remount would show here.
    await advance(1000);
    watch.stop();
    expect(watch.seen()).toBe(false);
    expect(screen.queryByTestId("swap-stub")).not.toBeNull();
    expect(loader.calls).toBe(1);
    expect(loader.mounts).toBe(1);
  });
});
