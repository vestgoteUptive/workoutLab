// T-0607 (D-0208, D-0210, D-0211, D-0213; UF-04.1, UF-04.3): the Cobalt plan-state contract that
// jsdom can read: the roots, the search, the chip anatomy, the tag, the compare rows, the
// stylesheet rules, and the contrast of every text pair (from tokens.json). The computed look,
// the 44 px targets, the theme-color and the motion are proven in a real browser in
// `tests/e2e/uf-04-library.spec.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { tokens } from "@workoutlab/design-tokens";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { en } from "../../../lib/i18n/en.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { offlineDb, userScopedKey } = await import("../../../lib/offline/db.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { mountAt, setOnline, rowNames } = await import("./harness.js");

const CSS = readFileSync(resolve(__dirname, "../uf-04.css"), "utf8");
// Only the T-0607 section: the legacy rules above it still serve UF-04.2 (T-0608).
const COBALT_CSS = CSS.slice(CSS.indexOf("/* ---- UF-04.1 Browse and UF-04.3 Compare"));
const MAIN_CSS = readFileSync(resolve(__dirname, "../../../main.css"), "utf8");
const PLAN = tokens.color.plan;

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

const stored = (id: string) => ({
  key: userScopedKey(USER, id),
  userId: USER,
  exerciseId: id,
  createdAt: "2026-09-01T10:00:00Z",
});

beforeEach(async () => {
  freshOfflineDb();
  signIn(USER);
  setOnline(false);
  spy.reset();
  seedSpy(spy);
  await refreshAll(NOW, TZ);
});
afterEach(() => {
  cleanup();
  signOut();
});

const group = () => screen.getByRole("group");
const chip = (name: string) => within(group()).getByRole("button", { name });

describe("AC1 state", () => {
  it("UF-04.1 and UF-04.3 are plan-state page roots, with a stopped title", async () => {
    const view = await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    const lib = document.querySelector('[data-screen-id="UF-04.1"]')!;
    expect(lib).toHaveAttribute("data-wl-state", "plan");
    expect(lib).toHaveClass("wl-page");
    expect(lib.querySelector("h1")).toHaveClass("wl-type-page-title", "wl-title--stop");
    expect(lib.querySelector("h1")).toHaveTextContent(en.screens.library);
    view.unmount();

    await mountAt("/library/back-squat/compare/leg-extension");
    await screen.findByRole("columnheader", { name: "Leg extension" });
    const cmp = document.querySelector('[data-screen-id="UF-04.3"]')!;
    expect(cmp).toHaveAttribute("data-wl-state", "plan");
    expect(cmp).toHaveClass("wl-page");
    // The h1 is bare in index.tsx (the shell's routes test reads it); the CSS gives it the role.
    expect(COBALT_CSS).toMatch(
      /\.wl-uf04-compare > h1 \{[^}]*font-size:\s*2\.75rem[^}]*font-weight:\s*700/,
    );
    expect(COBALT_CSS).toMatch(/\.wl-uf04-compare > h1::after \{[^}]*content:\s*"\." \/ ""/);
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
  });

  it("the detail screen is not migrated: no state, still the legacy root", async () => {
    await mountAt("/library/back-squat");
    await screen.findByRole("heading", { level: 1, name: "Back squat" });
    const root = document.querySelector('[data-screen-id="UF-04.2"]')!;
    expect(root).not.toHaveAttribute("data-wl-state");
    expect(root).toHaveClass("wl-uf04");
  });
});

describe("AC2 search and filters", () => {
  it("the search is a .wl-input; Clear shows only with text and empties the search", async () => {
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    const box = screen.getByRole("searchbox", { name: en.uf04.searchLabel });
    expect(box).toHaveClass("wl-input");
    expect(screen.queryByRole("button", { name: en.uf08.clearSearch })).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: "squat" } });
    const clear = screen.getByRole("button", { name: en.uf08.clearSearch });
    expect(clear).toHaveClass("wl-button--text");
    expect(clear).toHaveTextContent(/^Clear search$/);
    await waitFor(() => expect(rowNames().length).toBeLessThan(24));
    fireEvent.click(clear);
    expect(box).toHaveValue("");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(screen.queryByRole("button", { name: en.uf08.clearSearch })).not.toBeInTheDocument();
  });

  it("chips keep their names; the tick is aria-hidden; pressed and unpressed differ", async () => {
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    const names = within(group())
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual([
      "All",
      "Chest",
      "Back",
      "Shoulders",
      "Arms",
      "Core",
      "Glutes",
      "Quads",
      "Hamstrings",
      "Calves",
      "My equipment",
    ]);
    for (const b of within(group()).getAllByRole("button")) {
      expect(b).toHaveClass("wl-chip");
      const tick = b.querySelector("svg.wl-chip__tick");
      expect(tick).toHaveAttribute("aria-hidden", "true");
    }
    expect(chip("All")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Quads")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("Quads"));
    await waitFor(() => expect(chip("Quads")).toHaveAttribute("aria-pressed", "true"));
    expect(chip("All")).toHaveAttribute("aria-pressed", "false");
    // The fill and the tick are the shared chip rules, keyed on aria-pressed.
    expect(MAIN_CSS).toMatch(
      /\.wl-chip\[aria-pressed="true"\],[^{]*\{[^}]*background:\s*var\(--wl-selected\)/,
    );
    expect(MAIN_CSS).toMatch(
      /\.wl-chip\[aria-pressed="true"\][^{]*\.wl-chip__tick \{[^}]*display:\s*inline-block/,
    );
    expect(MAIN_CSS).toMatch(/\.wl-chip \.wl-chip__tick \{[^}]*display:\s*none/);
  });

  it("an empty search renders the existing line in the plan body type", async () => {
    await mountAt("/library?q=zzzz");
    const line = await screen.findByText(en.uf04.noMatchQuery("zzzz"));
    expect(line).toHaveClass("wl-type-body");
    expect(line.closest("[data-wl-state='plan']")).not.toBeNull();
  });
});

describe("AC3 tags", () => {
  it("Not suggested and Favorite are outline chips with their text; other rows have none", async () => {
    await offlineDb().excludedCache.put(stored("back-squat"));
    await offlineDb().favoriteCache.put(stored("leg-extension"));
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    await waitFor(() =>
      expect(document.querySelectorAll('[data-field="not-suggested"]')).toHaveLength(1),
    );
    const excluded = document.querySelector('[data-field="not-suggested"]')!;
    expect(excluded).toHaveClass("wl-uf04-browse__tag");
    expect(excluded.textContent).toBe(en.uf04.notSuggested);
    expect(excluded.closest("a")).toHaveAccessibleName(/^Back squat/);
    await waitFor(() =>
      expect(document.querySelectorAll('[data-field="favorite"]')).toHaveLength(1),
    );
    const fav = document.querySelector('[data-field="favorite"]')!;
    expect(fav).toHaveClass("wl-uf04-browse__tag");
    expect(fav.textContent).toBe(en.uf04.favorite);
    const tagged = [...document.querySelectorAll(".wl-uf04-browse__tag")].map((t) =>
      t.closest("a")!.getAttribute("href"),
    );
    expect(tagged).toEqual(["/library/back-squat", "/library/leg-extension"]);
    // The CSS draws it as an outline in plan ink: a border, no fill.
    expect(COBALT_CSS).toMatch(
      /\.wl-uf04-browse__tag \{[^}]*color:\s*var\(--wl-ink\)[^}]*border:\s*1px solid var\(--wl-line\)/,
    );
    expect(COBALT_CSS).not.toMatch(/\.wl-uf04-browse__tag \{[^}]*background/);
  });

  it("a row without a tag shows none", async () => {
    await mountAt("/library");
    await waitFor(() => expect(rowNames()).toHaveLength(24));
    expect(document.querySelector(".wl-uf04-browse__tag")).toBeNull();
    const link = screen.getByRole("link", { name: /^Back squat/ });
    expect(link).toHaveClass("wl-row");
    expect(link.querySelector('[data-field="name"]')).toHaveClass("wl-type-row-title");
  });

  it("the row name reads name, then the tag, then the captions (unchanged order)", async () => {
    await offlineDb().excludedCache.put(stored("back-squat"));
    await mountAt("/library");
    await waitFor(() =>
      expect(document.querySelectorAll('[data-field="not-suggested"]')).toHaveLength(1),
    );
    const link = screen.getByRole("link", { name: /^Back squat/ });
    expect(link).toHaveAccessibleName(
      `Back squat ${en.uf04.notSuggestedSr} ${en.uf04.notSuggested} Glutes, Quads Core, Hamstrings Barbell, Rack`,
    );
  });
});

describe("AC4 contrast, type, motion, scope", () => {
  it.each([
    ["ink on bg (titles, names, tag, chips)", PLAN.ink, PLAN.bg, 4.5],
    ["ink-muted on bg (captions, input boundary)", PLAN["ink-muted"], PLAN.bg, 4.5],
    ["ink on raise (hovered row, tag on hover)", PLAN.ink, PLAN.raise, 4.5],
    ["on-selected on selected (pressed chip)", PLAN["on-selected"], PLAN.selected, 4.5],
  ])("%s", (_n, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("the input boundary is plan.ink-muted at 3:1 or more on plan.bg", () => {
    expect(ratio(PLAN["ink-muted"], PLAN.bg)).toBeGreaterThanOrEqual(3);
    expect(MAIN_CSS).toMatch(/\.wl-input \{[^}]*border:\s*1px solid var\(--wl-ink-muted\)/);
  });

  it("the new rules use no px font size, no raw colour, no legacy colour token, no motion", () => {
    expect(COBALT_CSS.length).toBeGreaterThan(500);
    expect(COBALT_CSS).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(COBALT_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(COBALT_CSS).not.toMatch(/--wl-color-/);
    expect(COBALT_CSS).not.toMatch(/\b(transition|animation)\s*:/);
  });

  it("every new layout rule is scoped to its screen's own classes", () => {
    const bare = COBALT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...bare.matchAll(/^([^{}\s][^{}]*)\{/gm)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(8);
    for (const sel of selectors.filter((x) => !x.startsWith("@supports"))) {
      for (const part of sel.replace(/:is\([^)]*\)/g, "").split(",")) {
        expect(part.trim(), sel).toMatch(/^\.wl-uf04-(browse|compare)/);
      }
    }
  });

  it("the legacy rules UF-04.2 still uses are kept until T-0608", () => {
    for (const cls of [".wl-uf04", ".wl-uf04__list", ".wl-uf04__row", ".wl-uf04__link"]) {
      expect(CSS, cls).toContain(`${cls} {`);
    }
    expect(CSS).toContain(".wl-uf04__pill");
    expect(CSS).toContain(".wl-uf04__tag");
    expect(CSS).toContain(".wl-uf04__sr {");
  });
});

describe("AC5 behaviour", () => {
  it("compare: the attributes are a hairline table with the existing names; the link is a text button", async () => {
    await mountAt("/library/back-squat/compare/leg-extension");
    await screen.findByRole("columnheader", { name: "Leg extension" });
    const table = screen.getByRole("table");
    expect(table).toHaveClass("wl-uf04-compare__table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(7);
    for (const th of within(table).getAllByRole("rowheader"))
      expect(th).toHaveClass("wl-type-label");
    const back = screen.getByRole("link", { name: /Leg extension/ });
    expect(back).toHaveClass("wl-button--text");
    expect(COBALT_CSS).toMatch(
      /\.wl-uf04-compare__table :is\(th, td\) \{[^}]*border-block-end:\s*1px solid var\(--wl-line\)/,
    );
  });

  it("no cache and offline: the download message in plan body type, nothing else", async () => {
    freshOfflineDb();
    await mountAt("/library");
    const line = await screen.findByText(en.uf04.neverDownloaded);
    expect(line).toHaveClass("wl-type-body");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(line.closest("[data-screen-id='UF-04.1']")).toHaveAttribute("data-wl-state", "plan");
  });
});
