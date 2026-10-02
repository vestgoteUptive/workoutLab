// T-0386 AC1 (UF-08.1, D-0107 §3, D-0113): the read-sequence guard in `use-setup-data.ts`.
// A slow first cache read (content A) that settles after the post-refresh re-read (content B)
// has published must not overwrite B. Contrast: when A settles first, A publishes, then B.
// Content is told apart by `targets` (chest 20 in A, 24 in B) in the `suggest` spy's calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { suggest } from "@workoutlab/engine";
import type { AreaTarget } from "@workoutlab/shared";
import * as engineFeed from "../../../lib/offline/engine-feed.js";
import * as history from "../../../lib/offline/history.js";
import { fTargets } from "./fixtures.js";
import { fCache, fitLine, renderSetup, serveCache, setOnline, settle } from "./harness.js";

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({ useAuth: () => ({ status: auth.status }) }));
vi.mock("../../../lib/offline/history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/history.js")>();
  return {
    ...actual,
    loadLibrary: vi.fn(),
    loadTargets: vi.fn(),
    loadProfile: vi.fn(),
    refreshAll: vi.fn(async () => {}),
    lastSyncedAt: vi.fn(async () => null),
  };
});
vi.mock("../../../lib/offline/engine-feed.js", () => ({ loadEngineHistory: vi.fn() }));
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const spy = vi.mocked(suggest);
const refresh = vi.mocked(history.refreshAll);

function targetsB() {
  return fTargets().map((t) => (t.area === "chest" ? { ...t, setsPer14d: 24 } : t));
}

/** "A" or "B" for each `suggest` call, read from its `targets` argument. */
function contents(): string[] {
  return spy.mock.calls.map(([, targets]) => {
    const chest = (targets as AreaTarget[]).find((t) => t.area === "chest")!.setsPer14d;
    return chest === 20 ? "A" : chest === 24 ? "B" : "?";
  });
}

/**
 * The first read's four loaders hang until `release()`; they then resolve with content A. Every
 * later read is served at once with content B.
 */
function slowFirstRead(): { release: () => Promise<void> } {
  const a = fCache();
  serveCache(() => fCache({ targets: targetsB() }));
  const waiting: (() => void)[] = [];
  function hold<T>(value: T): () => Promise<T> {
    return () =>
      new Promise<T>((resolve) => {
        waiting.push(() => resolve(JSON.parse(JSON.stringify(value)) as T));
      });
  }
  vi.mocked(engineFeed.loadEngineHistory).mockImplementationOnce(hold(a.history) as never);
  vi.mocked(history.loadTargets).mockImplementationOnce(hold(a.targets) as never);
  vi.mocked(history.loadProfile).mockImplementationOnce(hold(a.profile) as never);
  vi.mocked(history.loadLibrary).mockImplementationOnce(hold(a.library) as never);
  return {
    release: async () => {
      await act(async () => {
        for (const go of waiting) go();
      });
      await settle();
    },
  };
}

beforeEach(() => {
  auth.status = "signed-in";
  vi.clearAllMocks();
  setOnline(true);
  refresh.mockImplementation(async () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AC1 a slow first read never overwrites the post-refresh re-read", () => {
  it("B publishes first; releasing A afterwards keeps B and makes no suggest call for A", async () => {
    const first = slowFirstRead();
    renderSetup();
    await settle();
    // The refresh resolved at once and the re-read published B while A still hangs.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(contents()).toEqual(["B"]);
    const line = fitLine().textContent;
    expect(line).toMatch(/^Fits: /);

    await first.release();
    expect(contents()).toEqual(["B"]);
    expect(contents().lastIndexOf("A")).toBe(-1);
    expect(fitLine().textContent).toBe(line);
  });

  it("contrast: A settles before the re-read starts, so A publishes and then B replaces it", async () => {
    let finishRefresh!: () => void;
    refresh.mockImplementation(() => new Promise<void>((r) => (finishRefresh = r)));
    const first = slowFirstRead();
    renderSetup();
    await settle();
    expect(contents()).toEqual([]);

    await first.release();
    expect(contents()).toEqual(["A"]);

    await act(async () => finishRefresh());
    await settle();
    expect(contents()).toEqual(["A", "B"]);
  });
});
