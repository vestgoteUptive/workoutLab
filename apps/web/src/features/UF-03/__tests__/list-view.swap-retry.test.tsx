// T-0478, D-0162 §3: "a failed UF-05 import doesn't stick" — the List view's own Swap, which
// mounts `SwapSheet` directly (not through a UF-09 seam), gets the same guarantee UF-09's swap
// seam has (T-0451). The factory runs on every import that isn't cached: a throw simulates a
// stale-deploy chunk 404.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListView } from "../index.js";
import { L1, NOW } from "./fixtures.js";
import {
  freshDb,
  seedLibraryAndTargets,
  seedProfile,
  signIn,
  signOut,
  waitReal,
} from "./helpers.js";
import { makeCtx, settle, type SpiedCtx } from "./list-helpers.js";

const loader = vi.hoisted(() => ({ calls: 0, failing: true }));

vi.mock("../../UF-05/index.js", async (importActual) => {
  loader.calls += 1;
  if (loader.failing) {
    throw new Error("Failed to fetch dynamically imported module: /assets/index-stale.js");
  }
  return importActual();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(NOW) });
  signIn();
  loader.calls = 0;
  loader.failing = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  await waitReal(50);
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  signOut();
});

async function mount(ctx: SpiedCtx = makeCtx()) {
  const db = freshDb();
  await seedLibraryAndTargets(db, L1);
  // The real `SwapSheet`'s own data load (`loadProfile`/`loadLibrary`/`loadEngineHistory`, T-0421)
  // needs a profile too, once the import itself finally resolves (the "recovers" test below).
  await seedProfile(db);
  const view = render(<ListView ctx={ctx} />);
  await screen.findByRole("button", { name: /Romanian deadlift/ });
  return { ctx, view };
}

async function openSwap(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
  await screen.findByText("Couldn't load alternatives.");
}

describe("T-0478 AC-1 a failed SwapSheet import doesn't stick (D-0162 §3)", () => {
  it("shows 'Couldn't load alternatives.' with Try again and Close; the card stays usable", async () => {
    await mount();
    await openSwap();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(document.querySelector('[data-screen-id="UF-03.1"]')).not.toBeNull();
    // Distinguishes this (the import itself never resolved, so `SwapLoadBoundary` caught it) from
    // the real `SwapSheet`'s own internal data-load failure, which shows the same text but no
    // "Try again" and no `[data-screen-id="UF-05.1"]` dialog (`SwapSheet.tsx`'s own `failed` state).
    expect(document.querySelector('[data-screen-id="UF-05.1"]')).toBeNull();
  });

  it("Close returns to the rows; the next Swap tap imports again (not the same cached rejection)", async () => {
    await mount();
    await openSwap();
    const callsAfterFirstFail = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(screen.getByRole("button", { name: "Swap Back squat" })).toBeTruthy();
    // Still offline/failing: tapping Swap again imports again (a fresh lazy, D-0162 §3), not the
    // page-lifetime-cached rejection a plain `lazy()` would replay silently with no new call.
    fireEvent.click(screen.getByRole("button", { name: "Swap Back squat" }));
    await screen.findByText("Couldn't load alternatives.");
    expect(loader.calls).toBeGreaterThan(callsAfterFirstFail);
  });

  it("Try again imports again; failing again shows the same failure state, no unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    await mount();
    await openSwap();
    const failedCalls = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Couldn't load alternatives.");
    expect(loader.calls).toBe(failedCalls + 1);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    for (const args of vi.mocked(console.error).mock.calls) {
      expect(args.map(String).join(" ")).toMatch(/Failed to fetch|error occurred|SwapLoadBoundary/);
    }
  });

  it("recovers: Try again after the chunk is reachable again shows the real sheet", async () => {
    await mount();
    await openSwap();
    loader.failing = false;
    const failedCalls = loader.calls;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("dialog", { name: "Replace Back squat" });
    expect(loader.calls).toBe(failedCalls + 1);
  });
});
