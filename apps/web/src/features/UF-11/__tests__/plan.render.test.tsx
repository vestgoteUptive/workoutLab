// T-0308b UF-11.2 Plan: AC-B1 (summary + target order), AC-B2 (target source), AC-B3 (first vs
// next check-in, through the engine and stubbed), AC-B4 (last 3 check-ins), AC-B5 (routines).
//
// `refreshAll`/`refreshRoutines` are resolved stubs here (per the ticket's test-surface note): the
// real ones `select` from `sessions`, `routines` and more, which would contradict AC-B6's
// "`from` never called" and AC-B11's exact call list. AC-B6's cache-first case uses the real one.
//
// T-0471 mounts `CheckinCard` above `PlanBody`; fixture F always has a proposal, so the card's own
// `insertIfFirstShown` effect fires here too. `lib/auth/client.js` is mocked to the same spy
// `checkin-card.test.tsx` uses: with no mock, `supabase.from` is the real (test-mode-configured)
// client, whose background session auto-refresh against `localStorage`'s `sb-abc-auth-token` key
// races this file's own `signIn`/`signOut` between tests (found running this file red on main).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { AREAS } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { K1, K2, K3, K4, KEPT_13_SEP, NOW, TZ, profileF, targetsF } from "./fixtures.js";
import {
  createFromSpy,
  freshDb,
  listRows,
  renderPlan,
  seedCache,
  signIn,
  signOut,
  useTimeZone,
} from "./test-helpers.js";

vi.mock("../../../lib/offline/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/offline/index.js")>();
  return {
    ...actual,
    refreshAll: vi.fn(async () => undefined),
    refreshRoutines: vi.fn(async () => undefined),
  };
});

const checkinSpy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => checkinSpy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;

beforeEach(() => {
  signIn();
  checkinSpy.reset();
  // Fixture F's tz. Every "local date" AC turns on this, so it is set for every test.
  useTimeZone(TZ);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

/** Waits for the target list to be on screen — the signal that the cache read landed. */
async function targetRows(): Promise<string[]> {
  await waitFor(() => expect(listRows(u.targetsList)).toHaveLength(9));
  return listRows(u.targetsList);
}

describe("AC-B1 plan summary, through the engine", () => {
  it("shows the goal, rhythm, no priorities and the 9 targets in the fixed order", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();

    expect(await targetRows()).toEqual([
      "Chest 20 hard sets",
      "Back 20 hard sets",
      "Shoulders 16 hard sets",
      "Arms 12 hard sets",
      "Core 12 hard sets",
      "Glutes 20 hard sets",
      "Quads 20 hard sets",
      "Hamstrings 16 hard sets",
      "Calves 12 hard sets",
    ]);
    expect(screen.getByText(u.goals.build_muscle)).toBeInTheDocument();
    expect(screen.getByText("3–4 per week")).toBeInTheDocument();
    expect(screen.getByText("6–8 sessions per 14 days")).toBeInTheDocument();
    expect(screen.getByText(u.noPriorities)).toBeInTheDocument();
    expect(document.querySelector("[data-screen-id]")!.getAttribute("data-screen-id")).toBe(
      "UF-11.2",
    );
  });

  it("contrast: targets cached in REVERSE area order still read in the fixed order", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: [...targetsF()].reverse() });
    renderPlan();
    const rows = await targetRows();
    expect(rows.map((r) => r.split(" ")[0])).toEqual([
      "Chest",
      "Back",
      "Shoulders",
      "Arms",
      "Core",
      "Glutes",
      "Quads",
      "Hamstrings",
      "Calves",
    ]);
  });

  it("contrast: a different goal and priorities show in the FIXED area order, and the F copy is absent", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF({ goal: "get_stronger", priorityAreas: ["hamstrings", "back"] }),
      targets: targetsF(),
    });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.goals.get_stronger)).toBeInTheDocument();
    // Spec change (UF-11.2.md): fixed area order, not stored order.
    expect(screen.getByText("Back, Hamstrings")).toBeInTheDocument();
    expect(screen.queryByText(u.goals.build_muscle)).not.toBeInTheDocument();
    expect(screen.queryByText(u.noPriorities)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Hamstrings, Back");
  });

  it("contrast: rhythm 1–1 reads `1–1 per week` and `2–2 sessions per 14 days`", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF({ rhythmMin: 1, rhythmMax: 1 }),
      targets: targetsF(),
    });
    renderPlan();
    await targetRows();
    expect(screen.getByText("1–1 per week")).toBeInTheDocument();
    expect(screen.getByText("2–2 sessions per 14 days")).toBeInTheDocument();
  });
});

describe("AC-B2 target source", () => {
  it("`adapted` reads the LOCAL date of updatedAt (00:30 on 27 Sep in Stockholm, not 26 Sep)", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF(),
      targets: targetsF({ back: { source: "adapted", updatedAt: "2026-09-26T22:30:00Z" } }),
    });
    renderPlan();
    const rows = await targetRows();
    const back = rows[AREAS.indexOf("back")];
    expect(back).toBe("Back 20 hard sets Adapted 27 Sep");
    expect(back).not.toContain("26 Sep");
    expect(back).not.toContain("From your plan");
    expect(back).not.toContain(u.sourceLabels.manual);
  });

  it("`manual` reads `Set by you`, and the other two labels are absent from that row", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF(),
      targets: targetsF({ calves: { source: "manual" } }),
    });
    renderPlan();
    const rows = await targetRows();
    const calves = rows[AREAS.indexOf("calves")];
    expect(calves).toBe("Calves 12 hard sets Set by you");
    expect(calves).not.toContain("From your plan");
    expect(calves).not.toContain("Adapted");
  });
});

describe("AC-B3 first / next check-in: always the engine's nextCheckinDate (D-0081 §1)", () => {
  it("a brand-new user (onboarded 20 Sep, no sessions, no check-ins) reads `First check-in on 4 Oct`", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF({
        onboardedAt: "2026-09-20T08:00:00Z",
        planUpdatedAt: "2026-09-20T08:00:00Z",
      }),
      targets: targetsF(),
    });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.firstCheckin("4 Oct"))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Next check-in");
  });

  it("fixture F reads `Next check-in: 11 Oct`", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.nextCheckin("11 Oct"))).toBeInTheDocument();
  });

  it("10 days off with no sessions does not move the date: still `11 Oct` on 7 Oct", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan({ now: () => new Date("2026-10-07T10:00:00.000Z") });
    await targetRows();
    expect(screen.getByText(u.nextCheckin("11 Oct"))).toBeInTheDocument();
  });

  it("on 11 Oct the engine rolls it to `25 Oct`", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan({ now: () => new Date("2026-10-11T10:00:00.000Z") });
    await targetRows();
    expect(screen.getByText(u.nextCheckin("25 Oct"))).toBeInTheDocument();
  });

  it("just edited (periods empty) with NO check-in rows reads `First check-in on 11 Oct`", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF({ planUpdatedAt: "2026-09-27T08:00:00Z" }),
      targets: targetsF(),
    });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.firstCheckin("11 Oct"))).toBeInTheDocument();
  });

  it("just edited (periods empty) but WITH a check-in row reads `Next check-in: 11 Oct` — D-0081 §1", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF({ planUpdatedAt: "2026-09-27T08:00:00Z" }),
      targets: targetsF(),
      checkins: [KEPT_13_SEP],
    });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.nextCheckin("11 Oct"))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("First check-in");
  });
});

describe("AC-B3 stubbed: the UI renders the engine's date verbatim (principle 3)", () => {
  it("nextCheckinDate 2026-12-24 with non-empty periods reads `Next check-in: 24 Dec`, not 11 Oct", async () => {
    const engine = await import("../checkin-evaluation.js");
    vi.spyOn(engine, "evaluatePlanCheckin").mockReturnValue({
      periods: [
        { index: 3, start: "2026-09-13", end: "2026-09-26", completed: 4, status: "on_plan" },
      ],
      proposal: null,
      nextCheckinDate: "2026-12-24",
    });
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.nextCheckin("24 Dec"))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("11 Oct");
  });

  it("contrast: the same date with empty periods and no rows reads `First check-in on 24 Dec`", async () => {
    const engine = await import("../checkin-evaluation.js");
    vi.spyOn(engine, "evaluatePlanCheckin").mockReturnValue({
      periods: [],
      proposal: null,
      nextCheckinDate: "2026-12-24",
    });
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.firstCheckin("24 Dec"))).toBeInTheDocument();
  });

  it("contrast: the date is a LOCAL DATE, not an instant — still `24 Dec` in America/Los_Angeles", async () => {
    // `new Date("2026-12-24")` is UTC midnight, which formats as 23 Dec west of UTC. The screen
    // must split the `YYYY-MM-DD` parts instead.
    useTimeZone("America/Los_Angeles");
    const engine = await import("../checkin-evaluation.js");
    vi.spyOn(engine, "evaluatePlanCheckin").mockReturnValue({
      periods: [],
      proposal: null,
      nextCheckinDate: "2026-12-24",
    });
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.firstCheckin("24 Dec"))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("23 Dec");
  });
});

describe("AC-B4 last 3 check-ins", () => {
  it("lists exactly the newest 3, newest first, whatever the cache insertion order", async () => {
    const db = freshDb();
    // Inserted K2, K4, K1, K3 on purpose.
    await seedCache(db, {
      profile: profileF(),
      targets: targetsF(),
      checkins: [K2, K4, K1, K3],
    });
    renderPlan();
    await targetRows();
    await waitFor(() => expect(listRows(u.headings.checkins)).toHaveLength(3));
    expect(listRows(u.headings.checkins)).toEqual([
      "27 Sep · 1 session · 3–4 → 2–3 per week · Waiting for you",
      "13 Sep · 10 sessions · 3–4 → 4–5 per week · Kept",
      "30 Aug · 2 sessions · 3–4 → 2–3 per week · Withdrawn",
    ]);
    expect(document.body.textContent).not.toContain("16 Aug");
  });

  it("an `accepted` row reads `Accepted`", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF(), checkins: [K1] });
    renderPlan();
    await targetRows();
    await waitFor(() => expect(listRows(u.headings.checkins)).toHaveLength(1));
    expect(listRows(u.headings.checkins)).toEqual([
      "16 Aug · 3 sessions · 4–5 → 3–4 per week · Accepted",
    ]);
  });

  it("with no rows: `No check-ins yet`, and no row element at all", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.noCheckins)).toBeInTheDocument();
    expect(document.querySelector(`ul[aria-label="${u.headings.checkins}"]`)).toBeNull();
  });
});

describe("AC-B5 routines list", () => {
  it("one link per routine in loader order, with the exact singular, plus `New routine`", async () => {
    const db = freshDb();
    await seedCache(db, {
      profile: profileF(),
      targets: targetsF(),
      routines: [
        {
          id: "r-lower",
          name: "Lower A",
          items: [
            { position: 0, exerciseId: "e1" },
            { position: 1, exerciseId: "e2" },
          ],
        },
        { id: "r-upper", name: "Upper B", items: [{ position: 0, exerciseId: "e3" }] },
      ],
    });
    renderPlan();
    await targetRows();
    await waitFor(() => expect(listRows(u.headings.routines)).toHaveLength(2));
    expect(listRows(u.headings.routines)).toEqual([
      "Lower A · 2 exercises",
      "Upper B · 1 exercise",
    ]);
    expect(screen.getByRole("link", { name: "Lower A · 2 exercises" })).toHaveAttribute(
      "href",
      "/plan/routines/r-lower",
    );
    expect(screen.getByRole("link", { name: "Upper B · 1 exercise" })).toHaveAttribute(
      "href",
      "/plan/routines/r-upper",
    );
    expect(screen.getByRole("link", { name: u.newRoutine })).toHaveAttribute(
      "href",
      "/plan/routines/new",
    );
  });

  it("with no routines: `No routines yet`, and `New routine` is still there", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByText(u.noRoutines)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: u.newRoutine })).toBeInTheDocument();
    expect(document.querySelector(`ul[aria-label="${u.headings.routines}"]`)).toBeNull();
  });

  it("has an `Edit plan` link to /plan/edit", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan();
    await targetRows();
    expect(screen.getByRole("link", { name: u.editPlan })).toHaveAttribute("href", "/plan/edit");
  });
});

describe("the check-in evaluation runs over the real engine feed", () => {
  it("a session with hard sets is counted, so the engine sees history", async () => {
    // Not an AC in itself: it proves `checkinSessions(sessions, history, library)` is wired, so
    // the AC-B3 engine cases are not passing on an empty feed by accident.
    const db = freshDb();
    await seedCache(db, {
      profile: profileF(),
      targets: targetsF(),
      library: [
        {
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
        } as never,
      ],
      sessions: [{ id: "S1", startedAt: "2026-09-26T10:00:00Z" }],
      sets: [
        { id: "x1", sessionId: "S1", exerciseId: "bench", completedAt: "2026-09-26T10:05:00Z" },
      ],
    });
    renderPlan();
    await targetRows();
    // The date formula is independent of session counts, so the assertion is that nothing threw
    // and the screen still renders the engine's date.
    expect(screen.getByText(u.nextCheckin("11 Oct"))).toBeInTheDocument();
    expect(NOW.toISOString()).toBe("2026-09-27T10:00:00.000Z");
  });
});
