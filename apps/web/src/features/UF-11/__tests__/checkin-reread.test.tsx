// T-0481 UF-11.2: Plan re-reads its cache after the card's Accept or Keep (D-0181 §1).
// `CheckinCard` gets `onAnswered`; `usePlanData(clock, revision)` does one cache-only re-read.
// Seed: `seedAc1Proposal` (rhythm 3-4, P2 = 7, P3 = 3, so the engine proposes 2-3; chest 20).
// `refreshAll` is mocked: its first call (Plan's mount refresh) writes nothing; an "accepted
// refresh" writes the accepted profile (2-3) and chest 14 into the real `lib/offline` cache.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { en } from "../../../lib/i18n/en.js";
import { CheckinCard } from "../CheckinCard.js";
import { Plan } from "../index.js";
import { NOW, TZ, profileF, targetsF } from "./fixtures.js";
import { freshDb, listRows, seedCache, signIn, signOut, useTimeZone } from "./test-helpers.js";
import { BENCH, createWritesSpy, sessionsFrom } from "./checkin-writes-helpers.js";
import type { OfflineDb } from "../../../lib/offline/db.js";

const u = en.uf11;
const uc = en.uf11.checkin;

const spy = createWritesSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const refreshAllMock = vi.fn<(now?: Date, tz?: string) => Promise<void>>();
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: (now?: Date, tz?: string) => refreshAllMock(now, tz),
    refreshCheckins: async () => undefined,
  };
});

let db: OfflineDb;

async function seedAc1Proposal() {
  db = freshDb();
  const p2 = sessionsFrom("p2-", "2026-08-30", 7);
  const p3 = sessionsFrom("p3-", "2026-09-13", 3);
  await seedCache(db, {
    profile: profileF({ rhythmMin: 3, rhythmMax: 4 }),
    targets: targetsF(),
    library: [BENCH],
    sessions: [...p2.sessions, ...p3.sessions],
    sets: [...p2.sets, ...p3.sets],
  });
}

/** What an accepted refresh leaves in the cache: rhythm 2-3 and chest 14. */
async function writeAccepted() {
  const userId = signIn();
  await db.profileCache.put({ userId, profile: profileF({ rhythmMin: 2, rhythmMax: 3 }) });
  const chest = targetsF({ chest: { setsPer14d: 14, source: "adapted" } })[0]!;
  await db.targetCache.put({ key: `${userId}:chest`, userId, target: chest });
}

/** Call 1 (Plan's mount refresh) writes nothing; call 2 runs `second`. */
function mockRefreshes(second: () => Promise<void>) {
  refreshAllMock.mockReset();
  refreshAllMock.mockImplementationOnce(async () => undefined);
  refreshAllMock.mockImplementationOnce(second);
}

function renderPlan() {
  return render(
    <MemoryRouter initialEntries={["/plan"]}>
      <Routes>
        <Route path="/plan" element={<Plan now={() => NOW} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = () => document.querySelector('[data-part="checkin-card"]');
const rhythmP = () =>
  Array.from(document.querySelectorAll("h2"))
    .find((h) => h.textContent === u.headings.rhythm)!
    .parentElement!.querySelector("p")!;
const nap = (ms = 50) => new Promise((r) => setTimeout(r, ms));

async function waitForCard() {
  await waitFor(() => expect(card()).not.toBeNull());
  await waitFor(() => expect(spy.calls.some((c) => c.method === "insert")).toBe(true));
  await nap(10);
  spy.reset();
}

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  refreshAllMock.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

describe("T-0481 AC-1 Accept re-reads the plan under the card", () => {
  it("T-0481 AC-1 Plan: card gone, rhythm 2-3 and chest 14 with no reload", async () => {
    await seedAc1Proposal();
    mockRefreshes(writeAccepted);
    renderPlan();
    await waitFor(() => expect(rhythmP().textContent).toBe(u.rhythm(3, 4)));
    await waitForCard();
    expect(listRows(u.headings.targets)[0]).toMatch(/^Chest 20 /);

    fireEvent.click(screen.getByRole("button", { name: uc.accept }));

    await waitFor(() => expect(card()).toBeNull());
    await waitFor(() => expect(rhythmP().textContent).toBe(u.rhythm(2, 3)));
    expect(listRows(u.headings.targets)[0]).toMatch(/^Chest 14 /);
  });

  it("T-0481 AC-1 onAnswered is called exactly once, after the card's refreshAll settled", async () => {
    await seedAc1Proposal();
    const log: string[] = [];
    refreshAllMock.mockReset();
    refreshAllMock.mockImplementation(async () => {
      log.push("refresh:start");
      await nap(20);
      log.push("refresh:settled");
    });
    const onAnswered = vi.fn(() => {
      log.push("onAnswered");
    });
    render(<CheckinCard now={() => NOW} timeZone={TZ} onAnswered={onAnswered} />);
    await waitForCard();

    fireEvent.click(screen.getByRole("button", { name: uc.accept }));

    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));
    await nap();
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(log).toEqual(["refresh:start", "refresh:settled", "onAnswered"]);
  });
});

describe("T-0481 AC-2 Keep, and a rejected refresh", () => {
  it("T-0481 AC-2 Keep: onAnswered once, rhythm still 3-4", async () => {
    await seedAc1Proposal();
    mockRefreshes(async () => undefined);
    const onAnswered = vi.fn();
    render(<CheckinCard now={() => NOW} timeZone={TZ} onAnswered={onAnswered} />);
    await waitForCard();

    fireEvent.click(screen.getByRole("button", { name: uc.keep }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));
    await nap();
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it("T-0481 AC-2 Plan Keep: rhythm still 3-4 and the card is gone", async () => {
    await seedAc1Proposal();
    mockRefreshes(async () => undefined);
    renderPlan();
    await waitFor(() => expect(rhythmP().textContent).toBe(u.rhythm(3, 4)));
    await waitForCard();
    fireEvent.click(screen.getByRole("button", { name: uc.keep }));
    await waitFor(() => expect(card()).toBeNull());
    await nap();
    expect(rhythmP().textContent).toBe(u.rhythm(3, 4));
  });

  it("T-0481 AC-2 Accept with a rejected refresh: onAnswered still once, rhythm 3-4, card stays gone", async () => {
    await seedAc1Proposal();
    mockRefreshes(async () => {
      throw new Error("refresh failed");
    });
    renderPlan();
    await waitFor(() => expect(rhythmP().textContent).toBe(u.rhythm(3, 4)));
    await waitForCard();

    fireEvent.click(screen.getByRole("button", { name: uc.accept }));
    await waitFor(() => expect(card()).toBeNull());
    await nap();
    expect(rhythmP().textContent).toBe(u.rhythm(3, 4));
    expect(card()).toBeNull();

    // Same flow on the bare card for the call count.
    cleanup();
    await seedAc1Proposal();
    refreshAllMock.mockReset();
    refreshAllMock.mockRejectedValue(new Error("refresh failed"));
    const onAnswered = vi.fn();
    render(<CheckinCard now={() => NOW} timeZone={TZ} onAnswered={onAnswered} />);
    await waitForCard();
    fireEvent.click(screen.getByRole("button", { name: uc.accept }));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledTimes(1));
    await nap();
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });
});

describe("T-0481 AC-3 no call when nothing was answered", () => {
  it("T-0481 AC-3 the area_targets step fails: error shown, no call", async () => {
    await seedAc1Proposal();
    refreshAllMock.mockResolvedValue(undefined);
    const onAnswered = vi.fn();
    render(<CheckinCard now={() => NOW} timeZone={TZ} onAnswered={onAnswered} />);
    await waitForCard();
    spy.failOn("area_targets", "reject");

    fireEvent.click(screen.getByRole("button", { name: uc.accept }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    await nap();
    expect(onAnswered).toHaveBeenCalledTimes(0);
  });

  it("T-0481 AC-3 hidden by another device's answer (23505): no call", async () => {
    await seedAc1Proposal();
    refreshAllMock.mockResolvedValue(undefined);
    spy.collideOn("plan_checkins");
    spy.answerRowOn("plan_checkins", "accepted");
    const onAnswered = vi.fn();
    render(<CheckinCard now={() => NOW} timeZone={TZ} onAnswered={onAnswered} />);
    await waitFor(() => expect(spy.calls.some((c) => c.method === "select")).toBe(true));
    await waitFor(() => expect(card()).toBeNull());
    await nap();
    expect(onAnswered).toHaveBeenCalledTimes(0);
  });

  it("T-0481 AC-3 offline: buttons disabled, no call", async () => {
    await seedAc1Proposal();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const onAnswered = vi.fn();
    render(<CheckinCard now={() => NOW} timeZone={TZ} onAnswered={onAnswered} />);
    await waitFor(() => expect(card()).not.toBeNull());
    const accept = screen.getByRole("button", { name: uc.accept });
    const keep = screen.getByRole("button", { name: uc.keep });
    expect(accept).toBeDisabled();
    expect(keep).toBeDisabled();
    fireEvent.click(accept);
    fireEvent.click(keep);
    await nap();
    expect(onAnswered).toHaveBeenCalledTimes(0);
  });
});

describe("T-0481 AC-4 a cache re-read, not a remount", () => {
  it("T-0481 AC-4 two refreshAll calls in total and the rhythm <p> is the same node", async () => {
    await seedAc1Proposal();
    mockRefreshes(writeAccepted);
    renderPlan();
    await waitFor(() => expect(rhythmP().textContent).toBe(u.rhythm(3, 4)));
    await waitForCard();
    const before = rhythmP();

    fireEvent.click(screen.getByRole("button", { name: uc.accept }));
    await waitFor(() => expect(rhythmP().textContent).toBe(u.rhythm(2, 3)));
    await nap();

    expect(rhythmP()).toBe(before);
    expect(refreshAllMock).toHaveBeenCalledTimes(2);
  });
});
