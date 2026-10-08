// T-0308c UF-11.1 CheckinCard, read side (AC-1 .. AC-7). now 2026-09-27T12:00:00+02:00, tz
// Europe/Stockholm, locale en-GB. "P2 = 7, P3 = 3" means sessions seeded so the engine's last two
// 14-day periods (index 2: 30 Aug-12 Sep, index 3: 13 Sep-26 Sep, onboarded 2026-08-02) have 7 and
// 3 completed sessions; only P3 (index 3, COMPARED_PERIODS = 1) feeds the proposal, so P2's count
// is flavour that matches the ticket's own wording and proves extra history doesn't leak in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CheckinEvaluation, LibraryExercise } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { CheckinCard } from "../CheckinCard.js";
import { NOW, profileF } from "./fixtures.js";
import { createFromSpy, freshDb, seedCache, signIn, signOut, useTimeZone } from "./test-helpers.js";

const TZ = "Europe/Stockholm";
const u = en.uf11.checkin;

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

// AC-2's stub and AC-4's rejected-loader case both need the REAL module most of the time, with
// one call swapped out for one test. A toggle on an always-installed mock (not `vi.doMock` +
// `vi.resetModules`, which would hand the freshly re-imported `CheckinCard` a brand-new
// `lib/offline/db.js` module instance with its own `db` singleton — invisible to the
// already-seeded cache from `test-helpers.js`'s OLD instance) keeps one IndexedDB underneath
// both the seeding helpers and the component under test, as `offline.test.tsx` does for
// `refreshAll`.
const evaluationStub = { current: null as CheckinEvaluation | null };
vi.mock("../checkin-evaluation.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkin-evaluation.js")>();
  return {
    ...actual,
    evaluatePlanCheckin: (...args: Parameters<typeof actual.evaluatePlanCheckin>) =>
      evaluationStub.current ?? actual.evaluatePlanCheckin(...args),
  };
});

const checkinsShouldReject = { current: false };
vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    loadCheckins: (...args: Parameters<typeof actual.loadCheckins>) =>
      checkinsShouldReject.current
        ? Promise.reject(new Error("boom"))
        : actual.loadCheckins(...args),
  };
});

const BENCH: LibraryExercise = {
  id: "bench",
  name: "Bench press",
  kind: "exercise",
  areas: [{ area: "chest", weight: 1 }],
  equipment: [],
  setupS: 60,
  perSetS: 45,
  defaultRestS: 90,
  level: "beginner",
  isUnilateral: false,
} as never;

/** `n` sessions, one hard set each, spread across the 14-day period starting at `startYmd`
 *  (a few same-day sessions once `n` exceeds 14, so the period window is never overrun). */
function sessionsFrom(prefix: string, startYmd: string, n: number) {
  const sessions: { id: string; startedAt: string }[] = [];
  const sets: { id: string; sessionId: string; exerciseId: string; completedAt: string }[] = [];
  const start = new Date(`${startYmd}T08:00:00Z`);
  for (let i = 0; i < n; i++) {
    const dayOffset = i % 14;
    const hour = 8 + Math.floor(i / 14); // extra same-day sessions, a few hours apart
    const at = new Date(
      start.getTime() + dayOffset * 86_400_000 + (hour - 8) * 3_600_000,
    ).toISOString();
    const id = `${prefix}${i}`;
    sessions.push({ id, startedAt: at });
    sets.push({ id: `${id}-set`, sessionId: id, exerciseId: "bench", completedAt: at });
  }
  return { sessions, sets };
}

interface SeedPeriodsOptions {
  rhythmMin?: number;
  rhythmMax?: number;
  p2?: number;
  p3?: number;
}

/** Seeds fixture F's profile (with the given rhythm) and P2/P3 session counts, through the real
 *  engine feed (library + sessions + sets), so the evaluation under test is the real
 *  `evaluateCheckin`, never a stub. */
async function seedPeriods({ rhythmMin = 3, rhythmMax = 4, p2 = 0, p3 = 0 }: SeedPeriodsOptions) {
  const db = freshDb();
  const p2Sessions = sessionsFrom("p2-", "2026-08-30", p2);
  const p3Sessions = sessionsFrom("p3-", "2026-09-13", p3);
  await seedCache(db, {
    profile: profileF({ rhythmMin, rhythmMax }),
    library: [BENCH],
    sessions: [...p2Sessions.sessions, ...p3Sessions.sessions],
    sets: [...p2Sessions.sets, ...p3Sessions.sets],
  });
}

function renderCard() {
  return render(<CheckinCard now={() => NOW} timeZone={TZ} locale="en-GB" />);
}

beforeEach(() => {
  signIn();
  useTimeZone(TZ);
  spy.reset();
  evaluationStub.current = null;
  checkinsShouldReject.current = false;
});

afterEach(() => {
  cleanup();
  signOut();
  evaluationStub.current = null;
  checkinsShouldReject.current = false;
  vi.restoreAllMocks();
});

describe("T-0308c AC-1 down, through the real engine, red on main", () => {
  it("reads the down copy with Accept, Keep current and no close button", async () => {
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    renderCard();

    await waitFor(() => expect(screen.getByRole("button", { name: u.accept })).toBeInTheDocument());
    expect(
      screen.getByText(
        "You trained 3 times in your last 14-day period (13 Sep–26 Sep). Your plan is 6–8. Switch to 2–3 per week?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: u.keep })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: u.cardName })).toBeInTheDocument();
  });
});

describe("T-0308c AC-2 copy rules, stubbed evaluation", () => {
  it("1 time (singular), the last listed period, and the engine's own proposal numbers", async () => {
    evaluationStub.current = {
      periods: [
        { index: 2, start: "2026-08-30", end: "2026-09-12", completed: 4, status: "on_plan" },
        { index: 3, start: "2026-09-13", end: "2026-09-26", completed: 1, status: "under" },
      ],
      proposal: {
        direction: "down",
        rhythmMin: 5,
        rhythmMax: 6,
        previewTargets: [],
      },
      nextCheckinDate: "2026-10-11",
    };
    const db = freshDb();
    await seedCache(db, { profile: profileF() });
    renderCard();

    await waitFor(() =>
      expect(
        screen.getByText(/You trained 1 time in your last 14-day period \(13 Sep–26 Sep\)\./),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/5–6 per week\?$/)).toBeInTheDocument();
  });
});

describe("T-0308c AC-3 preview", () => {
  it("lists all 9 areas, current -> proposal, in the fixed order", async () => {
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    renderCard();

    await waitFor(() => expect(screen.getByRole("button", { name: u.accept })).toBeInTheDocument());
    const list = screen.getByRole("list", { name: u.cardName });
    const rows = Array.from(list.querySelectorAll("li")).map((li) => li.textContent);
    expect(rows).toEqual([
      "Chest 20 → 14",
      "Back 20 → 14",
      "Shoulders 16 → 11",
      "Arms 12 → 9",
      "Core 12 → 9",
      "Glutes 20 → 14",
      "Quads 20 → 14",
      "Hamstrings 16 → 11",
      "Calves 12 → 9",
    ]);
  });
});

describe("T-0308c AC-4 no card, both values", () => {
  it("on plan (P3 = 5): no [data-part=checkin-card]", async () => {
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p3: 5 });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
  });

  it("zero history (just onboarded, no ended period yet): no card", async () => {
    const db = freshDb();
    // Onboarded on `now`'s own day: `currentIndex` is 0, so `evaluateCheckin` has no ended
    // period to compare (`periods` is empty) and there is no proposal — distinct from "an ended
    // period with 0 sessions", which IS a proposal (seen below in AC-5's rhythm 1-2/P3=0 case).
    await seedCache(db, { profile: profileF({ onboardedAt: "2026-09-27T08:00:00Z" }) });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
  });

  it("a rejected loadCheckins: no card, no console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    checkinsShouldReject.current = true;
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a missing profile: no card, no console.error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    freshDb();
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("T-0308c AC-5 up, floor and ceiling", () => {
  it("rhythm 3-4, P3 = 10: Step up to 4-5 per week?", async () => {
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p3: 10 });
    renderCard();
    await waitFor(() => expect(screen.getByText(/Step up to 4–5 per week\?/)).toBeInTheDocument());
  });

  it("rhythm 1-2, P3 = 0: floors at 1-1, and 0-1 never appears", async () => {
    await seedPeriods({ rhythmMin: 1, rhythmMax: 2, p3: 0 });
    renderCard();
    await waitFor(() =>
      expect(
        screen.getByText(
          "You trained 0 times in your last 14-day period (13 Sep–26 Sep). Your plan is 2–4. Switch to 1–1 per week?",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/0–1/)).not.toBeInTheDocument();
  });

  it("rhythm 1-1, P3 = 0: clamp leaves the rhythm unchanged, no card", async () => {
    await seedPeriods({ rhythmMin: 1, rhythmMax: 1, p3: 0 });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
  });

  it("rhythm 6-7, P3 = 16: Step up to 7-7 per week?, 7-8 never appears", async () => {
    await seedPeriods({ rhythmMin: 6, rhythmMax: 7, p3: 16 });
    renderCard();
    await waitFor(() => expect(screen.getByText(/Step up to 7–7 per week\?/)).toBeInTheDocument());
    expect(screen.queryByText(/7–8/)).not.toBeInTheDocument();
  });

  it("rhythm 7-7: clamp leaves the rhythm unchanged, no card", async () => {
    await seedPeriods({ rhythmMin: 7, rhythmMax: 7, p3: 16 });
    renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('[data-part="checkin-card"]')).not.toBeInTheDocument();
  });
});

describe("T-0308c AC-6 offline, both values", () => {
  it("disables both buttons and shows the connect line; online/offline toggle with no remount", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await seedPeriods({ rhythmMin: 3, rhythmMax: 4, p2: 7, p3: 3 });
    renderCard();

    await waitFor(() => expect(screen.getByRole("button", { name: u.accept })).toBeInTheDocument());
    const node = document.querySelector('[data-part="checkin-card"]');
    expect(node).not.toBeNull();
    expect(screen.getByRole("button", { name: u.accept })).toBeDisabled();
    expect(screen.getByRole("button", { name: u.keep })).toBeDisabled();
    expect(screen.getByText(u.connectToUpdate)).toBeInTheDocument();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    fireEvent(window, new Event("online"));

    await waitFor(() => expect(screen.getByRole("button", { name: u.accept })).toBeEnabled());
    expect(screen.getByRole("button", { name: u.keep })).toBeEnabled();
    expect(screen.queryByText(u.connectToUpdate)).not.toBeInTheDocument();
    expect(document.querySelector('[data-part="checkin-card"]')).toBe(node);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    await waitFor(() => expect(screen.getByRole("button", { name: u.accept })).toBeDisabled());
    expect(screen.getByRole("button", { name: u.keep })).toBeDisabled();
    expect(screen.getByText(u.connectToUpdate)).toBeInTheDocument();
    expect(document.querySelector('[data-part="checkin-card"]')).toBe(node);
  });
});

describe("T-0308c AC-7 exports, strings", () => {
  // T-0308c's own version of this describe block also asserted that clicking Accept or Keep made
  // no `supabase.from` call at all: this ticket (T-0470, read-only) shipped before the writes
  // existed. T-0470 adds them (`checkin-writes.test.tsx` AC-2/AC-3/AC-5), so that assertion is
  // gone from here, not weakened — the first-shown insert and the two buttons' writes are this
  // file's own fixture's concern now, covered in the sibling spec.

  it("index.tsx exports exactly CheckinCard, EditPlan and Plan (plus AccountSettings, ExcludedExercises)", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual([
      "AccountSettings",
      "CheckinCard",
      "EditPlan",
      "ExcludedExercises",
      "Plan",
    ]);
  });
});
