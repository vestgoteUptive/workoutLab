// T-0690 UF-11.3 Save: when the refresh after a successful write fails, retry the reads the
// save changed once after 400 ms, then go to the return route with no message (D-0270).
// Waits are real-clock polls (`pollUntil`), never `waitFor` under fake timers (T-0926, T-0930);
// only AC6 fakes `setTimeout`, and it advances the clock by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { EngineProfile } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { loadProfile } from "../../../lib/offline/index.js";
import { refreshAfterSave } from "../save-plan.js";
import { TZ, profileF, targetsF } from "./fixtures.js";
import {
  TEST_USER,
  createFromSpy,
  freshDb,
  listRows,
  location,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

type Real = typeof import("../../../lib/offline/index.js");
const real = vi.hoisted(() => ({ current: null as Real | null }));
/** The location each refreshAll call was made from: the save's runs on /plan/edit. */
const refreshAllAt: (string | null | undefined)[] = [];
const here = () => document.querySelector('[data-testid="location"]')?.getAttribute("title");

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<Real>();
  real.current = actual;
  return {
    ...actual,
    refreshRoutines: vi.fn(async () => undefined),
    refreshAll: vi.fn(async () => undefined),
    refreshHistory: vi.fn(async () => undefined),
    refreshLibrary: vi.fn(async () => undefined),
    refreshProfile: vi.fn(async () => undefined),
    refreshTargets: vi.fn(async () => undefined),
    refreshCheckins: vi.fn(async () => undefined),
  };
});
const offline = await import("../../../lib/offline/index.js");
const refreshAll = vi.mocked(offline.refreshAll);
const refreshProfile = vi.mocked(offline.refreshProfile);
const refreshTargets = vi.mocked(offline.refreshTargets);
const refreshCheckins = vi.mocked(offline.refreshCheckins);
const refreshHistory = vi.mocked(offline.refreshHistory);
const refreshLibrary = vi.mocked(offline.refreshLibrary);

const spy = createFromSpy({ emptyReads: true });
/** AC7: the `profiles` read answers from this queue; once empty, every read rejects. */
const profileReads: { queue: (Record<string, unknown> | "reject")[]; count: number } = {
  queue: [],
  count: 0,
};
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: {
    from: (table: string) => {
      const base = spy.from(table);
      if (table !== "profiles" || profileReads.queue.length === 0) return base;
      return {
        ...base,
        select: () => ({
          maybeSingle: () => {
            profileReads.count += 1;
            const next = profileReads.queue.shift() ?? "reject";
            profileReads.queue.push(
              ...(profileReads.queue.length === 0 ? ["reject" as const] : []),
            );
            return next === "reject"
              ? Promise.reject(new Error("profiles read failed"))
              : Promise.resolve({ data: next, error: null, status: 200 });
          },
        }),
      };
    },
  },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  refreshAllAt.length = 0;
  profileReads.queue = [];
  profileReads.count = 0;
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  // Spies first: restoring the `setTimeout` spy after `useRealTimers` would put the fake back.
  vi.restoreAllMocks();
  vi.useRealTimers();
  cleanup();
  signOut();
  for (const m of [
    refreshProfile,
    refreshTargets,
    refreshCheckins,
    refreshHistory,
    refreshLibrary,
  ]) {
    m.mockReset();
    m.mockImplementation(async () => undefined);
  }
  refreshAll.mockReset();
  refreshAll.mockImplementation(async () => undefined);
});

/** Polls on the real clock; `waitFor` is not used because AC6 swaps in fake timers. */
async function pollUntil(check: () => void, timeoutMs = 4000): Promise<void> {
  const end = performance.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (performance.now() > end) throw error;
    }
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    });
  }
}

function fProfile(overrides: Partial<EngineProfile> = {}): EngineProfile {
  return profileF({
    level: "beginner",
    equipment: ["barbell", "rack", "bench", "dumbbell", "cable", "machine", "pullup-bar"],
    ...overrides,
  });
}

/** Opens /plan/edit; the mount refresh is cleared from the spies, then `refreshAll` records
 *  where it is called from. */
async function openEdit() {
  const db = freshDb();
  await seedCache(db, { profile: fProfile(), targets: targetsF() });
  renderPlan({ at: "/plan/edit" });
  await waitFor(() => expect(listRows(u.previewHeading)).toHaveLength(9));
  await act(async () => {
    await Promise.resolve();
  });
  spy.reset();
  for (const m of [refreshAll, refreshProfile, refreshTargets, refreshCheckins]) m.mockClear();
  refreshHistory.mockClear();
  refreshLibrary.mockClear();
  return db;
}

const tap = (el: HTMLElement) =>
  act(async () => {
    fireEvent.click(el);
  });
const saveButton = () => screen.getByRole("button", { name: u.save });
const pickIntermediate = () =>
  tap(screen.getByRole("radio", { name: new RegExp(`^${u.levels.intermediate.label}`) }));
/** A mixed save: the goal and a priority area change, so `savePlan` runs. */
async function pickMixed() {
  await tap(screen.getByRole("radio", { name: u.goals.get_stronger }));
  await tap(screen.getByRole("button", { name: en.bodyMap.areas.chest }));
}
/** refreshAll calls made by the save itself (from /plan/edit), not the /plan mount's own. */
const saveRefreshes = () => refreshAllAt.filter((at) => at === "/plan/edit").length;
function recordRefreshAll(impl: () => Promise<void>) {
  refreshAll.mockImplementation(async () => {
    refreshAllAt.push(here());
    await impl();
  });
}
const reject = () => Promise.reject(new Error("refresh failed"));

describe("T-0690 AC1 refresh succeeds: one call, no retry", () => {
  it("T-0690 AC1 level-only: refreshAll once, no retry read, location /plan", async () => {
    await openEdit();
    recordRefreshAll(async () => undefined);
    await pickIntermediate();
    await tap(saveButton());
    await pollUntil(() => expect(location()).toBe("/plan"));
    expect(saveRefreshes()).toBe(1);
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(refreshTargets).not.toHaveBeenCalled();
    expect(refreshCheckins).not.toHaveBeenCalled();
  });
});

describe("T-0690 AC2 level-only, refreshAll fails, the retry succeeds", () => {
  it("T-0690 AC2 retries refreshProfile alone after the wait; nothing new on screen; then /plan", async () => {
    await openEdit();
    recordRefreshAll(reject);
    let release!: () => void;
    refreshProfile.mockImplementation(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );
    await pickIntermediate();
    const before = document.body.textContent;
    await tap(saveButton());
    await pollUntil(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    // While the retry is in flight the screen has not moved, and shows nothing new.
    expect(location()).toBe("/plan/edit");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).toBe(before);
    release();
    await pollUntil(() => expect(location()).toBe("/plan"));
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    expect(refreshTargets).not.toHaveBeenCalled();
    expect(refreshCheckins).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("T-0690 AC3 full save, refreshAll fails, the retry covers three reads", () => {
  it("T-0690 AC3 profile, targets and check-ins once each; no other refresh; location /plan", async () => {
    await openEdit();
    recordRefreshAll(reject);
    await pickMixed();
    await tap(saveButton());
    await pollUntil(() => expect(location()).toBe("/plan"));
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    expect(refreshTargets).toHaveBeenCalledTimes(1);
    expect(refreshCheckins).toHaveBeenCalledTimes(1);
    expect(refreshHistory).not.toHaveBeenCalled();
    expect(refreshLibrary).not.toHaveBeenCalled();
    expect(saveRefreshes()).toBe(1);
  });
});

describe("T-0690 AC4 the retry fails too: no message, still navigates", () => {
  it("T-0690 AC4 both fail: /plan, no alert, no unhandled rejection", async () => {
    await openEdit();
    recordRefreshAll(reject);
    refreshProfile.mockImplementation(reject);
    await pickIntermediate();
    await tap(saveButton());
    await pollUntil(() => expect(location()).toBe("/plan"));
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(unhandled).toEqual([]);
  });

  it("T-0690 AC4 the helper resolves 'stale' when a retried read fails, 'ok' when all succeed or refreshAll does", async () => {
    const wait = vi.fn(async () => undefined);
    const now = new Date();
    refreshAll.mockImplementation(reject);
    refreshProfile.mockImplementation(reject);
    await expect(refreshAfterSave({ scope: "level", now, tz: TZ, wait })).resolves.toBe("stale");
    // One of three failing is still stale.
    refreshProfile.mockImplementation(async () => undefined);
    refreshTargets.mockImplementation(reject);
    await expect(refreshAfterSave({ scope: "full", now, tz: TZ, wait })).resolves.toBe("stale");
    refreshTargets.mockImplementation(async () => undefined);
    await expect(refreshAfterSave({ scope: "full", now, tz: TZ, wait })).resolves.toBe("ok");
    expect(wait).toHaveBeenCalledWith(400);
    refreshAll.mockImplementation(async () => undefined);
    wait.mockClear();
    await expect(refreshAfterSave({ scope: "full", now, tz: TZ, wait })).resolves.toBe("ok");
    expect(wait).not.toHaveBeenCalled();
  });
});

describe("T-0690 AC5 a failed write: nothing is refreshed", () => {
  it.each([
    ["level-only", false],
    ["full", true],
  ])(
    "T-0690 AC5 %s write rejected: alert, stays on /plan/edit, no refresh or retry",
    async (_n, full) => {
      await openEdit();
      recordRefreshAll(reject);
      spy.failOn(full ? "area_targets" : "profiles", "error");
      if (full) await pickMixed();
      else await pickIntermediate();
      await tap(saveButton());
      await pollUntil(() => expect(screen.getByRole("alert")).toHaveTextContent(u.saveFailed));
      expect(location()).toBe("/plan/edit");
      expect(refreshAll).not.toHaveBeenCalled();
      expect(refreshProfile).not.toHaveBeenCalled();
      expect(refreshTargets).not.toHaveBeenCalled();
      expect(refreshCheckins).not.toHaveBeenCalled();
    },
  );
});

describe("T-0690 AC6 timing", () => {
  it("T-0690 AC6 refreshAll fails: no retry before 400 ms, the retry at 400 ms, /plan after it settles", async () => {
    await openEdit();
    recordRefreshAll(reject);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const timeouts = vi.spyOn(globalThis, "setTimeout");
    await pickIntermediate();
    await tap(saveButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(timeouts.mock.calls.some(([, ms]) => ms === 400)).toBe(true);
    expect(refreshProfile).not.toHaveBeenCalled();
    expect(location()).toBe("/plan/edit");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(location()).toBe("/plan");
  });

  it("T-0690 AC6 refreshAll resolves: no 400 ms timer is created", async () => {
    await openEdit();
    recordRefreshAll(async () => undefined);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const timeouts = vi.spyOn(globalThis, "setTimeout");
    await pickIntermediate();
    await tap(saveButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(location()).toBe("/plan");
    expect(timeouts.mock.calls.some(([, ms]) => ms === 400)).toBe(false);
  });
});

describe("T-0690 AC7 the retry repairs the cache (real refresh, fake-indexeddb)", () => {
  const row = (level: string) => ({
    goal: "build_muscle",
    level,
    equipment: fProfile().equipment,
    rhythm_min: 3,
    rhythm_max: 4,
    priority_areas: [],
    onboarded_at: "2026-08-02T08:00:00Z",
    plan_changed_at: "2026-08-02T08:00:00Z",
  });

  async function saveToIntermediate(queue: (Record<string, unknown> | "reject")[]) {
    await openEdit();
    const actual = real.current!;
    // Only the save's own refresh is real: the /plan mount refresh (the third attempt, which
    // would also repair the cache) is stubbed, so only the retry can.
    refreshAll.mockImplementation((now, tz) =>
      here() === "/plan" ? Promise.resolve() : actual.refreshAll(now, tz),
    );
    refreshProfile.mockImplementation(actual.refreshProfile);
    refreshTargets.mockImplementation(actual.refreshTargets);
    refreshCheckins.mockImplementation(actual.refreshCheckins);
    profileReads.queue = queue;
    profileReads.count = 0;
    await pickIntermediate();
    await tap(saveButton());
    await pollUntil(() => expect(location()).toBe("/plan"));
  }

  it("T-0690 AC7 first read rejects, the second answers intermediate: the cache holds intermediate", async () => {
    await saveToIntermediate(["reject", row("intermediate")]);
    await pollUntil(() => expect(profileReads.count).toBeGreaterThanOrEqual(2));
    expect((await loadProfile())?.level).toBe("intermediate");
  });

  it("T-0690 AC7 both reads reject: the cache still holds beginner and /plan renders", async () => {
    await saveToIntermediate(["reject"]);
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });
    expect(location()).toBe("/plan");
    expect((await loadProfile())?.level).toBe("beginner");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(TEST_USER).toBeTruthy();
  });
});
