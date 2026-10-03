// T-0463 AC-1/AC-2 (recovers) (UF-09.9, UF-03.1, D-0167): Try again, now succeeding, imports again and renders the view.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "./fixtures.js";
import { freshDb, seedSession, signIn, useFakeClock } from "./helpers.js";
import { NOW, buttons, click, findEl, openSettled, renderPaused } from "./t0463-fixtures.js";

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

describe("T-0463 list-view: Try again recovers", () => {
  it("calls the loader once more and renders the stub", async () => {
    await renderPaused();
    await openSettled("List view");
    expect(buttons()).toEqual(["Try again", "Close"]);
    const failedCalls = loader.calls;
    loader.failing = false;
    await click("Try again");
    await findEl(() => stub());
    expect(loader.calls).toBe(failedCalls + 1);
    expect(stub()).toHaveTextContent("item 1");
    expect(buttons()).not.toContain("Try again");
  });
});
