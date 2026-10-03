// T-0463 AC-3 (UF-09.9, UF-04, D-0167): after a failed load and Close, the next open imports again.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_A } from "./fixtures.js";
import { freshDb, screenId, seedSession, signIn, useFakeClock } from "./helpers.js";
import { FAIL, NOW, click, dialog, findEl, openSettled, renderPaused } from "./t0463-fixtures.js";

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

describe("T-0463 how-to: the next open retries", () => {
  it("fail, Close, open again: the loader is called again and the stub renders", async () => {
    await renderPaused();
    await openSettled("How to");
    expect(dialog()).toHaveTextContent(FAIL);
    const failedCalls = loader.calls;
    await click("Close");
    expect(screenId()).toBe("UF-09.9");
    loader.failing = false;
    await click("How to");
    await findEl(() => stub());
    expect(loader.calls).toBe(failedCalls + 1);
    expect(screen.queryByText(FAIL)).toBeNull();
  });
});
