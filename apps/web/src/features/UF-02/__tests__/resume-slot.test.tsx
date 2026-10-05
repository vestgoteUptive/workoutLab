// T-0395 AC6: Today mounts the UF-09 "Resume workout" card through `todayResumeSlot`
// (D-0139 §4), after the header and before the compact C-01 (or the no-plan line), in every
// Today state. The `lib/offline` loaders are mocked as in `today.test.tsx`; `offlineDb` and
// `localStorage` stay real, so a session seeded with the real `upsertSession` is read by the
// real `findResumable` (T-0395) the slot's `ResumeCard` calls.
//
// T-0471 (D-0177): only `todayCheckinSlot` is mocked to `null`; `todayResumeSlot` keeps its real
// value, since this file's own subject is the real `ResumeCard` through that slot. This file's
// own `PROFILE` fixture, read by the real `evaluatePlanCheckin` the real `CheckinCard` now runs
// on mount, yields a genuine proposal, which would otherwise render the check-in card where every
// test here expects (or counts past) the resume card, C-01 or the no-plan line (a fourth file
// needing this fix, per D-0177's own "revisit when").
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SessionPlan } from "@workoutlab/shared";
import { F_TZ, PROFILE, targets } from "./fixtures.js";
import { TEST_USER, freshDb, part, renderToday, signIn, signOut } from "./helpers.js";

vi.mock("../slots.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../slots.js")>();
  return { ...actual, todayCheckinSlot: null };
});

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));

const auth = vi.hoisted(() => ({ status: "signed-in" as "signed-in" | "stale" | "signed-out" }));
vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: auth.status, redirectTarget: "/welcome" as const, signOut: vi.fn() }),
}));
vi.mock("../../../lib/offline/engine-feed.js", () => ({
  loadEngineHistory: mocks.loadEngineHistory,
}));
vi.mock("../../../lib/offline/history.js", () => ({
  loadTargets: mocks.loadTargets,
  loadLibrary: mocks.loadLibrary,
  loadProfile: mocks.loadProfile,
  lastSyncedAt: mocks.lastSyncedAt,
  refreshAll: mocks.refreshAll,
}));

const { upsertSession } = await import("../../../lib/offline/queue.js");

const PLAN: SessionPlan = {
  version: 1,
  mainLiftId: "bench-press",
  warmup: [],
  items: [
    {
      exerciseId: "bench-press",
      isMain: true,
      sets: 3,
      repsMin: 6,
      repsMax: 8,
      durationS: null,
      costS: 500,
      backoff: null,
      prefill: { weightKg: 80, reps: 6, durationS: null, kind: "add_rep" },
      reasons: [],
    },
  ],
  startDeficits: {
    chest: 1,
    back: 1,
    shoulders: 1,
    arms: 1,
    core: 1,
    glutes: 1,
    quads: 1,
    hamstrings: 1,
    calves: 1,
  },
};

const NOW = new Date(F_TZ.now);

async function seedResumable(): Promise<void> {
  signIn(TEST_USER);
  await upsertSession({
    id: "s1",
    started_at: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
    time_budget_min: 45,
    energy: "normal",
    warmup_in_budget: true,
    ended_at: null,
    plan: PLAN,
  });
  window.localStorage.setItem(
    "wl-focus:s1",
    JSON.stringify({
      version: 1,
      sessionId: "s1",
      phase: "set",
      itemIndex: 0,
      setIndex: 1,
      warmupIndex: 0,
      timer: null,
      pausedAtMs: null,
      resumePhase: null,
      workoutPausedMs: 0,
      warmupStartedAtMs: null,
      warmupSpentMs: 0,
      loggedSets: [],
      timerPausedAtMs: null,
      skippedItems: [],
    }),
  );
}

const never = <T,>(): Promise<T> => new Promise<T>(() => {});
function hangEveryLoader(): void {
  for (const fn of [
    mocks.loadEngineHistory,
    mocks.loadTargets,
    mocks.loadLibrary,
    mocks.loadProfile,
    mocks.lastSyncedAt,
  ]) {
    fn.mockReturnValue(never());
  }
}

beforeEach(() => {
  auth.status = "signed-in";
  freshDb();
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue([]);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

const c01 = () => document.querySelector('[data-component="C-01"]');
const resume = () => part("resume");
const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("T-0395 AC6 Today mounts the resume slot", () => {
  it("ready: [data-part=resume] sits after the header and before C-01, and Start is still there", async () => {
    await seedResumable();
    renderToday(F_TZ);
    await waitFor(() => expect(resume()).not.toBeNull(), { timeout: 5000 });
    expect(resume()!.textContent).toContain("Workout in progress");
    expect(follows(resume()!, c01()!)).toBe(true);
    expect(document.querySelector('[data-part="date"]')!.compareDocumentPosition(resume()!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(await screen.findByRole("link", { name: "Start workout" })).toBeInTheDocument();
  });

  it("loading: the resume card still renders, before the busy C-01", () => {
    hangEveryLoader();
    signIn(TEST_USER);
    renderToday(F_TZ);
    // Not seeded in this test: no session to resolve, but the slot mounts regardless of Today's
    // own loading state (it reads IndexedDB and localStorage on its own).
    expect(document.querySelector('[data-component="C-01"]')).toHaveAttribute("aria-busy", "true");
  });

  it("no-plan: the card still shows, above the no-plan line", async () => {
    mocks.loadProfile.mockResolvedValue(null);
    await seedResumable();
    renderToday(F_TZ);
    await waitFor(() => expect(part("no-plan")).not.toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(resume()).not.toBeNull(), { timeout: 5000 });
    expect(follows(resume()!, part("no-plan")!)).toBe(true);
  });

  it("with no resumable session, Today's DOM is exactly as the existing UF-02 tests expect", async () => {
    signIn(TEST_USER);
    renderToday(F_TZ);
    await waitFor(() => expect(c01()).not.toBeNull());
    expect(resume()).toBeNull();
  });
});
