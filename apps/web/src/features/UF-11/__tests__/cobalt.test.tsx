// T-0612 UF-11.1 / UF-11.2 / UF-11.3 in the Cobalt plan state: the state roots, the target tiles
// (priority and not), the paper check-in card (pending and not), Edit plan's native inputs and
// its aria-disabled Save, and the stylesheet's own guards (no raw colour, no px font size).
// Colours and contrast are Playwright (the real cascade); this file pins the markup that carries
// them.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { en } from "../../../lib/i18n/en.js";
import { profileF, targetsF, TZ } from "./fixtures.js";
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
const NOW_LOCAL = () => new Date("2026-10-07T07:00:00.000Z");

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

const tiles = () => screen.queryByRole("list", { name: u.targetsList });

async function openPlan(priorityAreas: ("chest" | "back")[] = []) {
  const db = freshDb();
  await seedCache(db, { profile: profileF({ priorityAreas }), targets: targetsF() });
  renderPlan({ now: NOW_LOCAL });
  await waitFor(() => expect(tiles()).not.toBeNull());
}

describe("AC1 state roots", () => {
  it("/plan and /plan/edit carry data-wl-state=plan and a page title with a stop", async () => {
    await openPlan();
    const root = document.querySelector('[data-screen-id="UF-11.2"]')!;
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(within(root as HTMLElement).getByRole("heading", { level: 1 })).toHaveClass(
      "wl-title--stop",
    );
    cleanup();
    freshDb();
    await seedCache(freshDb(), { profile: profileF(), targets: targetsF() });
    renderPlan({ at: "/plan/edit" });
    await screen.findByRole("heading", { level: 1, name: en.screens.editPlan });
    const edit = document.querySelector('[data-screen-id="UF-11.3"]')!;
    expect(edit).toHaveAttribute("data-wl-state", "plan");
    // The Edit plan title stays a bare <h1> (a shell test scans for it); its stop is drawn in CSS.
    expect(edit).toHaveClass("wl-edit");
  });
});

describe("AC2 target tiles", () => {
  it("a priority tile has the marker class and the Priority text; a plain tile has neither", async () => {
    await openPlan(["chest"]);
    const items = within(tiles()!).getAllByRole("listitem");
    const chest = items.find((li) => li.textContent?.startsWith(en.bodyMap.areas.chest))!;
    const back = items.find((li) => li.textContent?.startsWith(en.bodyMap.areas.back))!;
    expect(chest).toHaveClass("wl-plan__tile--priority");
    expect(chest).toHaveTextContent(u.priorityTag);
    expect(back).not.toHaveClass("wl-plan__tile--priority");
    expect(back).not.toHaveTextContent(u.priorityTag);
    // The label and the number are separate nodes: ink-on-raise label, stat number.
    expect(chest.querySelector(".wl-plan__tile-area")).toHaveTextContent(en.bodyMap.areas.chest);
    expect(chest.querySelector(".wl-type-stat")).not.toBeNull();
  });
});

describe("AC3 the check-in paper panel", () => {
  it("is .wl-paper after the header when pending; absent when not", async () => {
    const db = freshDb();
    const p2 = sessionsFrom("p2-", "2026-08-30", 7);
    const p3 = sessionsFrom("p3-", "2026-09-13", 3);
    await seedCache(db, {
      profile: profileF({ rhythmMin: 3, rhythmMax: 4 }),
      targets: targetsF(),
      library: [BENCH],
      sessions: [...p2.sessions, ...p3.sessions],
      sets: [...p2.sets, ...p3.sets],
    });
    renderPlan({ now: NOW_LOCAL });
    const accept = await screen.findByRole("button", { name: u.checkin.accept });
    const card = accept.closest('[data-part="checkin-card"]')!;
    expect(card).toHaveClass("wl-paper");
    expect(document.querySelector("h1")!.parentElement!.nextElementSibling).toBe(card);
    expect(accept).not.toHaveClass("wl-button--primary");
    cleanup();
    await seedCache(freshDb(), { profile: profileF(), targets: targetsF() });
    renderPlan({ now: NOW_LOCAL });
    await waitFor(() => expect(tiles()).not.toBeNull());
    expect(document.querySelector(".wl-paper")).toBeNull();
  });
});

describe("AC4 the links", () => {
  it("none of the four links is a primary; the rows and the header pill keep their order", async () => {
    await openPlan();
    const names = [
      u.accountLink,
      u.favoritesRow.name(null),
      u.excludedRow.name(null),
      u.seeInBalance,
    ];
    const links = screen.getAllByRole("link");
    for (const link of links) {
      if (link.textContent === u.editPlan) continue;
      expect(link).not.toHaveClass("wl-button--primary");
    }
    expect(screen.getByRole("link", { name: names[0]! })).toHaveClass("wl-button--secondary");
    expect(screen.getByRole("link", { name: names[3]! })).toHaveClass("wl-row");
    const order = links.map((l) => l.getAttribute("href"));
    expect(order.indexOf("/plan/account")).toBeLessThan(order.indexOf("/plan/favorites"));
    expect(order.indexOf("/plan/favorites")).toBeLessThan(order.indexOf("/plan/excluded"));
    expect(order.indexOf("/plan/excluded")).toBeLessThan(order.indexOf("/balance"));
  });
});

describe("UF-11.3 Edit plan", () => {
  it("goal options are native radios in .wl-option rows; Save is aria-disabled, never disabled", async () => {
    await seedCache(freshDb(), { profile: profileF(), targets: targetsF() });
    renderPlan({ at: "/plan/edit" });
    const group = await screen.findByRole("radiogroup", { name: u.goalGroup });
    const options = group.querySelectorAll("label.wl-option");
    expect(options).toHaveLength(3);
    for (const o of options) expect(o.querySelector('input[type="radio"]')).not.toBeNull();
    const save = screen.getByRole("button", { name: u.save });
    expect(save).toHaveClass("wl-button--primary");
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).not.toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: u.goals.get_stronger }));
    await waitFor(() => expect(save).toHaveAttribute("aria-disabled", "false"));
    // The stepper buttons are segmented buttons; at the bound they are aria-disabled too.
    const dec = screen.getByRole("button", { name: u.decreaseMin });
    expect(dec.parentElement).toHaveClass("wl-segmented");
    expect(dec).not.toBeDisabled();
  });
});

describe("AC5 stylesheet guard", () => {
  const css = readFileSync(resolve(__dirname, "../plan.css"), "utf8");
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // The legacy block at the end of the file (Account settings, T-0613) is exempt.
  const own = code.slice(0, code.indexOf(".wl-plan__linkbtn"));
  it("no raw colour and no px font size in the Cobalt part", () => {
    expect(own).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(own).not.toMatch(/rgba?\(/);
    expect(own).not.toMatch(/font-size:\s*[\d.]+px/);
  });
  it("has no transition or animation", () => {
    expect(own).not.toMatch(/transition|animation/);
  });
});
