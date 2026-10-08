// T-0548 UF-11.2 rework part 1 (D-0203 §3, spec UF-11.2.md): header, "Your plan" card, targets
// tiles, Balance link, offline. Mocks mirror plan.render.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { AREAS } from "@workoutlab/shared";
import { en } from "../../../lib/i18n/en.js";
import { profileF, targetsF, TZ } from "./fixtures.js";
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

const checkinSpy = createFromSpy();
vi.mock("../../../lib/auth/client.js", () => ({
  supabase: { from: (table: string) => checkinSpy.from(table) },
  isSupabaseConfigured: () => true,
}));

const u = en.uf11;

beforeEach(() => {
  signIn();
  checkinSpy.reset();
  useTimeZone(TZ);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

const norm = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const root = () => document.querySelector('[data-screen-id="UF-11.2"]')!;
const tiles = () => Array.from(screen.getByRole("list", { name: u.targetsList }).children);

async function ready(over: Parameters<typeof targetsF>[0] = {}, profile = {}) {
  const db = freshDb();
  await seedCache(db, { profile: profileF(profile), targets: targetsF(over) });
  renderPlan();
  await waitFor(() => expect(tiles()).toHaveLength(9));
}

const MIXED = {
  chest: { source: "manual" as const },
  shoulders: { source: "adapted" as const, updatedAt: "2026-10-03T08:00:00Z" },
};

describe("T-0548 AC1 header", () => {
  it("holds the h1, the account link and the purpose line", async () => {
    await ready();
    const header = root().querySelector("header")!;
    expect(root().firstElementChild).toBe(header);
    expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent("Plan");
    expect(within(header).getByRole("link", { name: u.accountLink })).toHaveAttribute(
      "href",
      "/plan/account",
    );
    expect(within(header).getByText(u.purpose)).toBeInTheDocument();
    expect(u.purpose).toBe(
      "Your goal, rhythm and the hard sets each area aims for every 14 days. It adapts to what you actually do.",
    );
    expect(root().className).toContain("wl-page");
  });
});

describe("T-0548 AC2 Your plan card", () => {
  it("lists goal, rhythm with its 14-day caption, priority areas and the one Edit plan link", async () => {
    await ready({}, { rhythmMin: 3, rhythmMax: 5, priorityAreas: ["shoulders", "chest"] });
    const card = screen.getByRole("heading", { name: "Your plan" }).closest("section")!;
    expect(Array.from(card.querySelectorAll("dt")).map(norm)).toEqual([
      "Goal",
      "Rhythm",
      "Priority areas",
    ]);
    expect(Array.from(card.querySelectorAll("dd")).map(norm)).toEqual([
      "Build muscle",
      "3–5 per week 6–10 sessions per 14 days",
      "Chest, Shoulders",
    ]);
    const edit = within(card).getByRole("link", { name: u.editPlan });
    expect(edit).toHaveAttribute("href", "/plan/edit");
    expect(edit.className).toContain("wl-button--primary");
    expect(screen.getAllByRole("link", { name: u.editPlan })).toHaveLength(1);
  });

  it("reads None with no priority areas, and no tile is a priority tile", async () => {
    await ready();
    const card = screen.getByRole("heading", { name: "Your plan" }).closest("section")!;
    expect(card.querySelectorAll("dd")[2]).toHaveTextContent("None");
    expect(tiles().filter((t) => norm(t).includes("Priority"))).toEqual([]);
  });
});

describe("T-0548 AC3 sources", () => {
  it("shows Adapted / Set by you on the matching tiles and never `From your plan`", async () => {
    await ready(MIXED);
    expect(root().textContent).not.toContain("From your plan");
    expect(norm(tiles()[AREAS.indexOf("shoulders")]!)).toBe("Shoulders 16 hard sets Adapted 3 Oct");
    expect(norm(tiles()[AREAS.indexOf("chest")]!)).toBe("Chest 20 hard sets Set by you");
    expect(norm(tiles()[AREAS.indexOf("back")]!)).toBe("Back 20 hard sets");
  });

  it("with every target default no tile has a caption and the footnote appears once", async () => {
    await ready();
    expect(tiles().map(norm)).toEqual(
      AREAS.map(
        (a, i) => `${en.bodyMap.areas[a]} ${[20, 20, 16, 12, 12, 20, 20, 16, 12][i]} hard sets`,
      ),
    );
    expect(screen.getAllByText(u.targetsNote)).toHaveLength(1);
    expect(u.targetsNote).toBe("Set from your goal, rhythm and priority areas.");
  });
});

describe("T-0548 AC4 tiles", () => {
  it("has nine li in area order, each `{Area} n hard sets`, Priority only on priority tiles", async () => {
    await ready(MIXED, { priorityAreas: ["chest", "shoulders"] });
    const t = tiles();
    expect(t.map((li) => li.tagName)).toEqual(Array(9).fill("LI"));
    t.forEach((li, i) =>
      expect(norm(li)).toMatch(new RegExp(`^${en.bodyMap.areas[AREAS[i]!]} \\d+ hard sets`)),
    );
    expect(norm(t[0]!)).toContain("Priority · Set by you");
    expect(norm(t[2]!)).toContain("Priority · Adapted 3 Oct");
    expect(t.filter((li) => norm(li).includes("Priority"))).toHaveLength(2);
  });
});

describe("T-0548 AC2/spec AC2 headings", () => {
  it("renders the four card h2s in order when ready", async () => {
    await ready();
    const h2 = Array.from(root().querySelectorAll("h2")).map(norm);
    expect(h2).toEqual([u.yourPlan, u.headings.targets, u.headings.checkins, u.headings.routines]);
  });
});

describe("T-0548 AC5 Balance link", () => {
  it("is the last element of the Targets card and points at /balance", async () => {
    await ready();
    const card = screen.getByRole("heading", { name: "Targets" }).closest("section")!;
    const link = within(card).getByRole("link", { name: u.seeInBalance });
    expect(link).toHaveAttribute("href", "/balance");
    expect(card.lastElementChild).toBe(link);
    expect(screen.getByText(u.targetsCaption)).toBeInTheDocument();
  });
});

describe("T-0548 AC8 offline", () => {
  it("still renders the card and tiles, and both links stay links", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await ready(MIXED);
    expect(screen.getByRole("link", { name: u.editPlan })).toHaveAttribute("href", "/plan/edit");
    expect(screen.getByRole("link", { name: u.seeInBalance })).toHaveAttribute("href", "/balance");
    expect(norm(tiles()[0]!)).toBe("Chest 20 hard sets Set by you");
  });
});

describe("T-0548 AC7 UF-11.3 gutter class", () => {
  it("the edit screen root uses .wl-page", async () => {
    const db = freshDb();
    await seedCache(db, { profile: profileF(), targets: targetsF() });
    renderPlan({ at: "/plan/edit" });
    await screen.findByRole("group", { name: u.rhythmGroup });
    expect(document.querySelector('[data-screen-id="UF-11.3"]')!.className).toContain("wl-page");
  });
});
