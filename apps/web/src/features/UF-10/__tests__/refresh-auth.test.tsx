// T-0383 UF-10.1 / UF-10.2: the mount refresh runs only online and signed in, once per mount, with
// the 3 s cap measured from the refresh's own start (D-0113 §1 to §5). The two D-0104 rejection
// guards (D-0115 §2) are pinned here too: `useExerciseNames` and the `useBalance` cache read.
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { OfflineDb } from "../../../lib/offline/db.js";
import { en } from "../../../lib/i18n/en.js";
import * as history from "../../../lib/offline/history.js";
import * as feed from "../../../lib/offline/engine-feed.js";
import { authState, type AuthStatus } from "./auth-mock.js";
import {
  BACK_SQUAT,
  LIBRARY,
  LOCALE,
  NOW,
  RDL,
  TZ,
  areaBalance,
  balanceResult,
  defaultTargets,
  sets,
  zeroAreas,
} from "./fixtures.js";
import {
  BalanceTree,
  freshDb,
  renderBalance,
  rowAreas,
  rowValue,
  seedCache,
  signIn,
  signOut,
} from "./test-helpers.js";
import { REFRESH_TIMEOUT_MS } from "../use-balance.js";

vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

/** Every `supabase.from(table)` the screen makes (the balance.engine.test.tsx proxy). */
const fromCalls: string[] = [];
vi.mock("../../../lib/auth/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/auth/client.js")>();
  return {
    ...actual,
    supabase: new Proxy(actual.supabase, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) => {
            fromCalls.push(table);
            return (target.from as (t: string) => unknown)(table);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }),
  };
});

const at = { now: new Date(NOW), timeZone: TZ, locale: LOCALE };

/** A real macrotask, inside `act` so any state it lets through is flushed. */
const macrotask = (ms = 50) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

let db: OfflineDb;
let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  db = freshDb();
  fromCalls.length = 0;
  signIn();
  authState.status = "signed-in";
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  cleanup();
  process.off("unhandledRejection", onUnhandled);
  authState.status = "signed-in";
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setOnline(online: boolean): void {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

async function seedDefault(): Promise<void> {
  await seedCache(db, { library: LIBRARY, targets: defaultTargets() });
}

async function waitForRows(): Promise<void> {
  await waitFor(() => expect(rowAreas()).toHaveLength(9));
}

describe("D-0113 §1: online + signed-in refreshes once, after the cache has painted", () => {
  it("AC1: refreshAll is called exactly once, the rows were on screen at that moment, and the balance is recomputed after it settles", async () => {
    setOnline(true);
    const rowsAtCall: number[] = [];
    const refresh = vi.spyOn(history, "refreshAll").mockImplementation(async () => {
      rowsAtCall.push(rowAreas().length);
      await seedCache(db, { sets: sets(BACK_SQUAT.id, "2026-09-25T10:00:00+02:00", 5) });
    });
    await seedDefault();
    renderBalance(at);
    await waitForRows();
    await waitFor(() => expect(rowValue("quads")).toBe("5 / 20"));
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(rowsAtCall).toEqual([9]);
  });

  it("AC1: a later re-render with the same signed-in status starts no second refresh", async () => {
    setOnline(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await seedDefault();
    const view = renderBalance(at);
    await waitForRows();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    view.rerender(<BalanceTree {...at} />);
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("AC1 under StrictMode: the simulated remount still starts exactly one refresh", async () => {
    setOnline(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await seedDefault();
    render(
      <StrictMode>
        <BalanceTree {...at} />
      </StrictMode>,
    );
    await waitForRows();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("D-0113 §3: stale and signed-out get no refresh", () => {
  it.each<AuthStatus>(["stale", "signed-out"])(
    "AC2/AC3: online + %s → 0 refreshAll calls, 0 supabase.from calls, nine rows from the cache",
    async (status) => {
      setOnline(true);
      authState.status = status;
      // A pass-through spy over a 200 `[]` fetch: were the real refresh to run, `fromCalls`
      // would record it (the CONTRAST below shows it does).
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
      const refresh = vi.spyOn(history, "refreshAll");
      await seedDefault();
      renderBalance(at);
      await waitForRows();
      await macrotask();
      expect(refresh).toHaveBeenCalledTimes(0);
      expect(fromCalls).toEqual([]);
      expect(rowAreas()).toHaveLength(9);
      expect(rowValue("quads")).toBe("0 / 20");
    },
  );

  it("CONTRAST: the same pass-through spy online + signed-in records the refresh and its reads", async () => {
    setOnline(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    const refresh = vi.spyOn(history, "refreshAll");
    await seedDefault();
    renderBalance(at);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fromCalls).toContain("area_targets"));
  });
});

describe("D-0113 §2: stale → signed-in during the mount refreshes exactly once", () => {
  it("AC4: 0 calls while stale, 1 after the status turns signed-in, still 1 after 50 ms and another signed-in re-render", async () => {
    setOnline(true);
    authState.status = "stale";
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await seedDefault();
    const view = renderBalance(at);
    await waitForRows();
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(0);

    authState.status = "signed-in";
    view.rerender(<BalanceTree {...at} />);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(1);
    view.rerender(<BalanceTree {...at} />);
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("AC4 (once per mount): signed-in → stale → signed-in in one mount is still exactly 1 call", async () => {
    setOnline(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await seedDefault();
    const view = renderBalance(at);
    await waitForRows();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    authState.status = "stale";
    view.rerender(<BalanceTree {...at} />);
    await macrotask();
    authState.status = "signed-in";
    view.rerender(<BalanceTree {...at} />);
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("AC5: offline", () => {
  it("offline + signed-in → 0 refreshAll calls, nine rows from the cache", async () => {
    setOnline(false);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    await seedDefault();
    renderBalance(at);
    await waitForRows();
    await macrotask();
    expect(refresh).toHaveBeenCalledTimes(0);
  });
});

describe("AC6: the 3 s cap is measured from the refresh's start (D-0113 §4)", () => {
  it("stale at mount, signed-in at t = 1000 ms, hanging refresh → the re-read lands at 4000 ms, not 3000 ms", async () => {
    expect(REFRESH_TIMEOUT_MS).toBe(3000);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setOnline(true);
    authState.status = "stale";
    // Loader stubs that settle in microtasks, so fake timers control every wait there is.
    vi.spyOn(feed, "loadEngineHistory").mockResolvedValue([]);
    vi.spyOn(history, "loadLibrary").mockResolvedValue([...LIBRARY]);
    vi.spyOn(history, "lastSyncedAt").mockResolvedValue(null);
    const targets = vi.spyOn(history, "loadTargets").mockResolvedValue(defaultTargets());
    const refresh = vi
      .spyOn(history, "refreshAll")
      .mockImplementation(() => new Promise<void>(() => {}));

    const view = renderBalance(at);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(rowAreas()).toHaveLength(9);
    expect(targets).toHaveBeenCalledTimes(1); // the first cache read

    await act(() => vi.advanceTimersByTimeAsync(1000)); // t = 1000
    expect(refresh).toHaveBeenCalledTimes(0);
    authState.status = "signed-in";
    view.rerender(<BalanceTree {...at} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(2000)); // t = 3000
    expect(targets).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(999)); // t = 3999
    expect(targets).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1)); // t = 4000
    expect(targets).toHaveBeenCalledTimes(2); // the post-refresh re-read
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("D-0104 / D-0115 §2 rejection guards", () => {
  const withContributors = balanceResult(
    zeroAreas().map((a) =>
      a.area === "hamstrings"
        ? areaBalance("hamstrings", {
            load: 6,
            target: 16,
            coverageStep: 2,
            contributors: [
              { exerciseId: RDL.id, weightedSets: 4, lastDate: "2026-09-20" },
              { exerciseId: BACK_SQUAT.id, weightedSets: 2, lastDate: "2026-09-25" },
            ],
          })
        : a,
    ),
  );

  function contributorTexts(): string[] {
    return Array.from(document.querySelectorAll('[data-part="contributor"]')).map(
      (el) => el.textContent ?? "",
    );
  }

  it("AC7: UF-10.2 with a rejecting loadLibrary shows the exercise ids, with no unhandled rejection and no console.error", async () => {
    setOnline(false);
    const consoleError = vi.spyOn(console, "error");
    vi.spyOn(history, "loadLibrary").mockRejectedValue(new Error("idb gone"));
    renderBalance({ ...at, result: withContributors, at: "/balance/hamstrings" });
    await macrotask();
    const texts = contributorTexts();
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain(RDL.id);
    expect(texts[1]).toContain(BACK_SQUAT.id);
    expect(texts[0]).not.toContain(RDL.name);
    expect(unhandled).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("CONTRAST: the same screen with a resolving loadLibrary shows the library names", async () => {
    setOnline(false);
    vi.spyOn(history, "loadLibrary").mockResolvedValue([...LIBRARY]);
    renderBalance({ ...at, result: withContributors, at: "/balance/hamstrings" });
    await waitFor(() => expect(contributorTexts()[0]).toContain(RDL.name));
  });

  it("AC8: a rejecting loadEngineHistory leaves UF-10.1 in its pre-read state, with no unhandled rejection and no error screen", async () => {
    // Online + signed-in, so the post-refresh re-read rejects as well.
    setOnline(true);
    const refresh = vi.spyOn(history, "refreshAll").mockResolvedValue(undefined);
    const engineHistory = vi
      .spyOn(feed, "loadEngineHistory")
      .mockRejectedValue(new Error("idb gone"));
    await seedDefault();
    renderBalance(at);
    await macrotask();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(engineHistory).toHaveBeenCalledTimes(2));
    await macrotask();
    expect(unhandled).toEqual([]);
    expect(document.querySelector('[data-screen-id="UF-10.1"]')).not.toBeNull();
    // The `result: null` render: the generic title, no rows, no alert.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.screens.balance);
    expect(rowAreas()).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
