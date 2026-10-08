// T-0549 UF-11.2 rework part 2 (D-0203 §3, spec UF-11.2.md blocks 2, 7, 8, "Primary action",
// "States"): headings, one primary action, the Check-ins card, the Routines card, loading and
// cold cache, offline. AC7 (touch targets) and AC9 (UF-02.1) are Playwright.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { en } from "../../../lib/i18n/en.js";
import { checkin, profileF, targetsF, TZ } from "./fixtures.js";
import { BENCH, sessionsFrom } from "./checkin-writes-helpers.js";
import {
  createFromSpy,
  freshDb,
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

const spy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => spy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;
const NOW_LOCAL = () => new Date("2026-10-07T07:00:00.000Z"); // 09:00 Europe/Stockholm

beforeEach(() => {
  signIn();
  spy.reset();
  useTimeZone(TZ);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

const root = () => document.querySelector('[data-screen-id="UF-11.2"]')!;
const h2s = () => Array.from(root().querySelectorAll("h2")).map((h) => h.textContent);
const primaries = () => root().querySelectorAll(".wl-button--primary");
const tiles = () => screen.queryByRole("list", { name: u.targetsList });

/** Rhythm 3-4, P2 = 7 and P3 = 3 sessions: the engine proposes a step down. */
async function seedPending(extra: Parameters<typeof seedCache>[1] = {}) {
  const db = freshDb();
  const p2 = sessionsFrom("p2-", "2026-08-30", 7);
  const p3 = sessionsFrom("p3-", "2026-09-13", 3);
  await seedCache(db, {
    profile: profileF({ rhythmMin: 3, rhythmMax: 4 }),
    targets: targetsF(),
    library: [BENCH],
    sessions: [...p2.sessions, ...p3.sessions],
    sets: [...p2.sets, ...p3.sets],
    ...extra,
  });
}

async function seedPlain(extra: Parameters<typeof seedCache>[1] = {}) {
  const db = freshDb();
  await seedCache(db, { profile: profileF(), targets: targetsF(), ...extra });
}

async function readyPlain(extra: Parameters<typeof seedCache>[1] = {}) {
  await seedPlain(extra);
  renderPlan({ now: NOW_LOCAL });
  await waitFor(() => expect(tiles()).not.toBeNull());
}

async function readyPending(extra: Parameters<typeof seedCache>[1] = {}) {
  await seedPending(extra);
  renderPlan({ now: NOW_LOCAL });
  await screen.findByRole("button", { name: u.checkin.accept });
  await waitFor(() => expect(tiles()).not.toBeNull());
}

describe("T-0549 AC1 headings", () => {
  it("pending proposal: five h2s in order", async () => {
    await readyPending();
    expect(h2s()).toEqual(["Check-in", "Your plan", "Targets", "Check-ins", "Routines"]);
  });

  it("no pending proposal: four h2s, without Check-in", async () => {
    await readyPlain();
    expect(h2s()).toEqual(["Your plan", "Targets", "Check-ins", "Routines"]);
  });
});

describe("T-0549 AC2 one primary action", () => {
  it("no proposal: Edit plan is the one primary", async () => {
    await readyPlain();
    const edit = screen.getByRole("link", { name: u.editPlan });
    expect(edit).toHaveClass("wl-button--primary");
    expect(edit).not.toHaveClass("wl-button--secondary");
    expect(primaries()).toHaveLength(1);
  });

  it("pending proposal: Accept is the one primary, Edit plan is secondary and still a link", async () => {
    await readyPending();
    const edit = screen.getByRole("link", { name: u.editPlan });
    // Edit plan flips one render tick after the card shows (passive effect): wait on the class.
    await waitFor(() => expect(edit).toHaveClass("wl-button--secondary"));
    expect(edit).not.toHaveClass("wl-button--primary");
    await waitFor(() => expect(primaries()).toHaveLength(1));
    expect(edit).toHaveAttribute("href", "/plan/edit");
    expect(screen.getByRole("button", { name: u.checkin.accept })).toHaveClass(
      "wl-button--primary",
    );
    expect(screen.getByRole("button", { name: u.checkin.keep })).toHaveClass(
      "wl-button--secondary",
    );
    expect(primaries()).toHaveLength(1);
  });

  it("Edit plan goes back to primary once the card is answered away", async () => {
    await readyPending();
    fireEvent.click(screen.getByRole("button", { name: u.checkin.keep }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: u.checkin.accept })).not.toBeInTheDocument(),
    );
    // The visibility signal is a passive effect cleanup, so it lands a tick after the DOM.
    await waitFor(() =>
      expect(screen.getByRole("link", { name: u.editPlan })).toHaveClass("wl-button--primary"),
    );
    expect(primaries()).toHaveLength(1);
  });
});

describe("T-0549 AC3 Check-ins card", () => {
  const card = () => screen.getByRole("heading", { level: 2, name: "Check-ins" }).parentElement!;

  it("first period, no check-ins: First check-in, the date, No check-ins yet, no list, the explanation", async () => {
    await readyPlain({
      profile: profileF({
        onboardedAt: "2026-09-30T08:00:00Z",
        planUpdatedAt: "2026-09-30T08:00:00Z",
      }),
    });
    const c = within(card());
    expect(c.getByText("First check-in")).toBeInTheDocument();
    expect(c.getByText(/^\d{1,2} [A-Z][a-z]{2}$/)).toHaveClass("wl-stat");
    expect(c.getByText("No check-ins yet")).toBeInTheDocument();
    expect(c.queryByRole("list")).not.toBeInTheDocument();
    expect(c.getByText(u.checkinsExplain)).toHaveClass("wl-muted");
    expect(u.checkinsExplain).toBe(
      "Every 14 days we compare your sessions with your rhythm. If you're under or over two periods in a row, we suggest a new rhythm. Nothing changes until you accept.",
    );
  });

  it("four check-ins: Next check-in, the newest 3, newest first, two lines each", async () => {
    await readyPlain({
      checkins: [
        checkin("a", "2026-08-12T08:00:00Z", 2, [3, 5], [2, 4], "kept"),
        checkin("b", "2026-08-26T08:00:00Z", 1, [3, 5], [2, 4], "accepted"),
        checkin("c", "2026-09-09T08:00:00Z", 3, [3, 5], [4, 6], "withdrawn"),
        checkin("d", "2026-09-23T08:00:00Z", 4, [3, 5], [4, 6], null),
      ],
    });
    const c = within(card());
    expect(c.getByText("Next check-in")).toBeInTheDocument();
    expect(c.queryByText("First check-in")).not.toBeInTheDocument();
    const items = c.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("23 Sep · 3–5 → 4–6 per week");
    expect(items[0]).toHaveTextContent("4 sessions · Waiting for you");
    expect(items[1]).toHaveTextContent("9 Sep · 3–5 → 4–6 per week");
    expect(items[2]).toHaveTextContent("26 Aug · 3–5 → 2–4 per week");
    expect(items[2]).toHaveTextContent("1 session · Accepted");
    expect(card().textContent).not.toContain("12 Aug");
    expect(c.queryByText("No check-ins yet")).not.toBeInTheDocument();
  });
});

describe("T-0549 AC4 Routines card", () => {
  const routines = [
    {
      id: "r-legs",
      name: "Legs A",
      items: Array.from({ length: 7 }, (_, i) => ({ position: i, exerciseId: `e${i}` })),
    },
    { id: "r-push", name: "Push", items: [{ position: 0, exerciseId: "e0" }] },
  ];

  it("one row link per routine, accessible name with the count, and New routine as secondary", async () => {
    await readyPlain({ routines });
    const legs = screen.getByRole("link", { name: "Legs A, 7 exercises" });
    expect(legs).toHaveAttribute("href", "/plan/routines/r-legs");
    expect(legs).toHaveClass("wl-row");
    expect(screen.getByRole("link", { name: "Push, 1 exercise" })).toHaveAttribute(
      "href",
      "/plan/routines/r-push",
    );
    const add = screen.getByRole("link", { name: u.newRoutine });
    expect(add).toHaveAttribute("href", "/plan/routines/new");
    expect(add).toHaveClass("wl-button--secondary");
    expect(add.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(primaries()).toHaveLength(1);
  });

  it("no routines: No routines yet and still New routine", async () => {
    await readyPlain();
    expect(screen.getByText("No routines yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: u.newRoutine })).toHaveAttribute(
      "href",
      "/plan/routines/new",
    );
  });
});

describe("T-0549 AC5 loading and cold cache", () => {
  it("loading: header plus one status line, no h2", () => {
    freshDb();
    renderPlan({ now: NOW_LOCAL });
    expect(root().querySelector("header")).not.toBeNull();
    const status = within(root() as HTMLElement).getByRole("status");
    expect(status).toHaveTextContent("Loading your plan");
    expect(status).toHaveClass("wl-caption");
    expect(h2s()).toEqual([]);
  });

  it("cold cache offline: header and the notice, no h2", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    freshDb();
    renderPlan({ now: NOW_LOCAL });
    const line = await screen.findByText(u.coldCache);
    expect(line.closest("p")).toHaveClass("wl-plan__notice");
    expect(root().querySelector("header")).not.toBeNull();
    expect(h2s()).toEqual([]);
    expect(within(root() as HTMLElement).queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("T-0549 AC6 offline", () => {
  it("Accept and Keep are disabled; Edit plan, routines and New routine stay links", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await seedPending({
      routines: [{ id: "r-push", name: "Push", items: [{ position: 0, exerciseId: "e0" }] }],
    });
    renderPlan({ now: NOW_LOCAL });
    const accept = await screen.findByRole("button", { name: u.checkin.accept });
    await waitFor(() => expect(tiles()).not.toBeNull());
    expect(accept).toBeDisabled();
    expect(screen.getByRole("button", { name: u.checkin.keep })).toBeDisabled();
    const edit = screen.getByRole("link", { name: u.editPlan });
    // Edit plan flips to secondary one render tick after the card state settles (passive effect).
    await waitFor(() => expect(edit).toHaveClass("wl-button--secondary"));
    expect(edit).toHaveAttribute("href", "/plan/edit");
    expect(screen.getByRole("link", { name: "Push, 1 exercise" })).toHaveAttribute(
      "href",
      "/plan/routines/r-push",
    );
    expect(screen.getByRole("link", { name: u.newRoutine })).toHaveAttribute(
      "href",
      "/plan/routines/new",
    );
  });
});

describe("T-0549 check-in card preview rows", () => {
  it("each row has the area left and the numbers in a bold span right", async () => {
    await readyPending();
    const row = screen.getByRole("list", { name: u.checkin.cardName }).querySelector("li")!;
    expect(row.children[0]).toHaveTextContent("Chest");
    expect(row.children[1]).toHaveClass("wl-plan__nums");
    expect(row.children[1]).toHaveTextContent("→");
    expect(screen.getByRole("heading", { level: 2, name: "Check-in" })).toHaveClass("wl-label");
  });
});
