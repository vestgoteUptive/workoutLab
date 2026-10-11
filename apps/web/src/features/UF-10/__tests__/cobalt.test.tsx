// T-0611 (D-0208, D-0210, D-0211, D-0213; UF-10.1, UF-10.2): the Cobalt plan-state contract that
// jsdom can read: the state root, the row anatomy, the strip's cells and their words, the stylesheet
// rules, the contrast of every text pair (from tokens.json) and the three "no history" renders.
// The computed look is proven in a real browser in `tests/e2e/uf-10-balance.spec.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { tokens } from "@workoutlab/design-tokens";
import { en } from "../../../lib/i18n/en.js";
import { authState } from "./auth-mock.js";
import {
  EXERCISE_NAMES,
  LOCALE,
  NOW,
  TZ,
  areaBalance,
  balanceResult,
  defaultTargets,
  zeroAreas,
} from "./fixtures.js";
import {
  freshDb,
  renderBalance,
  row,
  rowAreas,
  seedCache,
  signIn,
  signOut,
} from "./test-helpers.js";

vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const CSS = readFileSync(resolve(__dirname, "../balance.css"), "utf8");
const at = { now: new Date(NOW), timeZone: TZ, locale: LOCALE };
const PLAN = tokens.color.plan;
// The canvas mock's attention value, which the README overrides (it fails contrast on plan.bg).
const MOCK_ATTENTION = ["ff9a", "85"].join("");

beforeEach(() => {
  freshDb();
  signIn();
  authState.status = "signed-in";
});
afterEach(() => {
  cleanup();
  signOut();
  vi.restoreAllMocks();
});

function lum(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const MIXED = () => [
  areaBalance("calves", { needsAttention: true, deficit: 0.9, load: 1, coverageStep: 1 }),
  areaBalance("chest", { deficit: 0.5, load: 10, coverageStep: 3 }),
  areaBalance("quads", { load: 18, coverageStep: 4, deficit: 0.1, recovering: true }),
];

describe("AC1 state", () => {
  it("both screens are plan-state page roots", () => {
    renderBalance({ ...at, result: balanceResult(MIXED()) });
    for (const id of ["UF-10.1"]) {
      const root = document.querySelector(`[data-screen-id="${id}"]`)!;
      expect(root).toHaveAttribute("data-wl-state", "plan");
      expect(root).toHaveClass("wl-page");
    }
    cleanup();
    renderBalance({
      ...at,
      result: balanceResult(MIXED()),
      at: "/balance/calves",
      exerciseNames: EXERCISE_NAMES,
    });
    const detail = document.querySelector('[data-screen-id="UF-10.2"]')!;
    expect(detail).toHaveAttribute("data-wl-state", "plan");
    expect(detail).toHaveClass("wl-page");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
  });

  it("the title is a page title with the stop, the window line is a label, Plan is a text button", () => {
    renderBalance({ ...at, result: balanceResult(MIXED()) });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.querySelector(".wl-type-page-title.wl-title--stop")).toHaveTextContent(
      en.screens.balance,
    );
    expect(h1.querySelector(".wl-type-label")).toHaveTextContent(en.uf10.window("14–27 Sep"));
    expect(screen.getByRole("link", { name: en.uf10.planLink })).toHaveClass("wl-button--text");
  });
});

describe("AC2 attention", () => {
  it("only the needsAttention row carries the label and the outline hook; both stay words", () => {
    renderBalance({ ...at, result: balanceResult(MIXED()) });
    const calves = row("calves")!;
    const chest = row("chest")!;
    expect(calves).toHaveAttribute("data-attention", "true");
    expect(calves).toHaveClass("wl-row");
    expect(calves.querySelector('[data-part="attention"]')).toHaveTextContent("Needs attention");
    expect(chest).not.toHaveAttribute("data-attention");
    expect(chest.querySelector('[data-part="attention"]')).toBeNull();
    expect(chest.querySelector('[data-part="recovering"]')).toBeNull();
    expect(row("quads")!.querySelector('[data-part="recovering"]')).toHaveTextContent(
      en.uf10.recovering,
    );
    // The trailing value is a row title and the accessible name is unchanged.
    expect(calves.querySelector('[data-part="value"]')).toHaveClass("wl-type-row-title");
    expect(calves).toHaveAccessibleName(en.uf10.rowName("Calves", "1", "12", true));
  });

  it("the CSS draws the outline 2 px in --wl-attention and keeps no legacy or mock colour", () => {
    expect(CSS).toMatch(
      /\.wl-balance__row\[data-attention="true"\] \{[^}]*outline:\s*2px solid var\(--wl-attention\)/,
    );
    expect(CSS).not.toMatch(/--wl-color-/);
    expect(CSS).not.toMatch(new RegExp(MOCK_ATTENTION, "i"));
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("plan.attention is 5.0 or more on plan.bg, and is not the mock's lighter-red value", () => {
    expect(PLAN.attention.toLowerCase()).not.toBe(`#${MOCK_ATTENTION}`);
    expect(ratio(PLAN.attention, PLAN.bg)).toBeGreaterThanOrEqual(5.0);
  });
});

describe("AC4 strip", () => {
  it("a day with hard sets is marked filled and keeps its words; an empty day keeps its own", () => {
    const days = Array.from({ length: 14 }, (_, i) => (i === 11 ? 6 : 0));
    renderBalance({
      ...at,
      result: balanceResult([areaBalance("hamstrings", { load: 6, days })]),
      at: "/balance/hamstrings",
      exerciseNames: EXERCISE_NAMES,
    });
    const cells = [...document.querySelectorAll<HTMLElement>('[data-part="strip-cell"]')];
    expect(cells).toHaveLength(14);
    const filled = cells.filter((c) => c.dataset.filled === "true");
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveAttribute("aria-label", en.uf10.stripCell("25 Sep", "6"));
    expect(cells[0]).toHaveAttribute("aria-label", en.uf10.stripCellEmpty("14 Sep"));
    expect(cells[0]).not.toHaveAttribute("data-filled");
    expect(CSS).toMatch(/\.wl-balance-detail__cell \{[^}]*background:\s*var\(--wl-raise\)/);
    expect(CSS).toMatch(
      /\.wl-balance-detail__cell\[data-filled="true"\] \{[^}]*background:\s*var\(--wl-ink\)/,
    );
  });

  it("value-first stats keep the existing strings, and contributors are rows", () => {
    renderBalance({
      ...at,
      result: balanceResult([
        areaBalance("hamstrings", {
          load: 6,
          deficit: 0.625,
          lastTrainedDate: "2026-09-25",
          contributors: [
            { exerciseId: "romanian-deadlift", weightedSets: 4, lastDate: "2026-09-20" },
          ],
        }),
      ]),
      at: "/balance/hamstrings",
      exerciseNames: EXERCISE_NAMES,
    });
    expect(document.querySelector('[data-part="value"]')).toHaveClass("wl-type-stat");
    expect(document.querySelector('[data-part="deficit"]')).toHaveTextContent(/^63 %Below target$/);
    expect(screen.getByText(en.uf10.lastTrainedDaysAgo("2"))).toBeInTheDocument();
    const rowEl = document.querySelector('[data-part="contributor"]')!;
    expect(rowEl).toHaveClass("wl-row");
    const cta = screen.getByRole("link", { name: en.uf10.startWorkout });
    expect(cta).toHaveClass("wl-button--primary");
    expect(cta.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});

describe("AC5 contrast per text pair, from the tokens", () => {
  it.each([
    ["ink on bg (rows, titles)", PLAN.ink, PLAN.bg, 4.5],
    ["ink-muted on bg (window line, Recovering)", PLAN["ink-muted"], PLAN.bg, 4.5],
    ["attention on bg (Needs attention)", PLAN.attention, PLAN.bg, 4.5],
    ["ink on raise (hover, bar track)", PLAN.ink, PLAN.raise, 4.5],
    ["ink-on-raise on raise (empty strip cell)", PLAN["ink-on-raise"], PLAN.raise, 4.5],
    ["on-selected on ink (a strip cell with sets)", PLAN["on-selected"], PLAN.ink, 4.5],
    ["on-action on action (Start workout)", PLAN["on-action"], PLAN.action, 4.5],
  ])("%s", (_name, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("the attention label is not drawn in attention on the hover fill (4.1:1 there)", () => {
    expect(ratio(PLAN.attention, PLAN.raise)).toBeLessThan(4.5);
    expect(CSS).toMatch(/:hover \.wl-balance__label--attention \{[^}]*color:\s*var\(--wl-ink\)/);
  });

  it("targets: the row, the plan link and the strip are sized; no px font size, no transition", () => {
    expect(CSS).toMatch(/\.wl-balance__row \{[^}]*min-height:\s*44px/);
    expect(CSS).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(CSS).not.toMatch(/\b(transition|animation)\s*:/);
  });
});

describe("AC6 plan state with no history, after time off, and with no data", () => {
  it("zero history: plan root, nine rows, empty line, the one primary", () => {
    renderBalance({ ...at, result: balanceResult(zeroAreas()) });
    expect(document.querySelector('[data-screen-id="UF-10.1"]')).toHaveAttribute(
      "data-wl-state",
      "plan",
    );
    expect(rowAreas()).toHaveLength(9);
    expect(screen.getByText(en.uf10.emptyState)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.uf10.startWorkout })).toHaveClass(
      "wl-button--primary",
    );
    expect(document.querySelector('[data-part="attention"]')).toBeNull();
  });

  it("back after 10 days off: sets only at the start of the window, real engine, plan root", async () => {
    // Last training on 2026-09-17, so 10 days before "today", 2026-09-27.
    const { sets } = await import("./fixtures.js");
    const { RDL } = await import("./fixtures.js");
    const db = freshDb();
    await seedCache(db, {
      library: [RDL],
      targets: defaultTargets(),
      sets: sets("romanian-deadlift", "2026-09-17T10:00:00+02:00", 6),
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderBalance({ ...at, at: "/balance/hamstrings" });
    await waitFor(() =>
      expect(document.querySelector('[data-part="last-trained"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-screen-id="UF-10.2"]')).toHaveAttribute(
      "data-wl-state",
      "plan",
    );
    expect(screen.getByText(en.uf10.lastTrainedDaysAgo("10"))).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-part="contributor"]')).not.toBeNull());
  });

  it.each([
    ["/balance", "UF-10.1"],
    ["/balance/chest", "UF-10.2"],
  ])("offline and never loaded (%s): the no-data line, still a plan root", async (path, id) => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderBalance({ ...at, at: path });
    const line = await screen.findByRole("status");
    expect(line).toHaveTextContent(en.uf10.noData);
    expect(document.querySelector(`[data-screen-id="${id}"]`)).toHaveAttribute(
      "data-wl-state",
      "plan",
    );
  });
});
