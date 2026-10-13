// T-0601 (D-0208, D-0210, D-0211, D-0213; UF-02.1, UF-02.2): the plan-state markup of Today and the
// Workout preview, and the stylesheet rules jsdom can read. The computed look (colours, size,
// gutter, contrast, motion, the canvas compare) is proven in a real browser in
// `tests/e2e/uf-02-today.spec.ts`. `../slots.js` is mocked as in the other UF-02 tests (T-0914).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { Workout } from "@workoutlab/engine";
import { L1_WITH_WARMUP, PROFILE, W_R7E4_WITH_WARMUP, targets } from "./fixtures.js";
import { macrotask, previewScreenRoot, renderSwitch } from "./helpers.js";

vi.mock("../slots.js", () => ({ todayCheckinSlot: null, todayResumeSlot: null }));

const mocks = vi.hoisted(() => ({
  loadEngineHistory: vi.fn(),
  loadTargets: vi.fn(),
  loadLibrary: vi.fn(),
  loadProfile: vi.fn(),
  lastSyncedAt: vi.fn(),
  refreshAll: vi.fn(),
}));

vi.mock("../../../lib/auth/auth-context.js", () => ({
  useAuth: () => ({ status: "signed-in", redirectTarget: "/welcome" as const, signOut: vi.fn() }),
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
vi.mock("@workoutlab/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workoutlab/engine")>();
  return { ...actual, suggest: vi.fn(actual.suggest) };
});

const { suggest } = await import("@workoutlab/engine");
const suggestSpy = vi.mocked(suggest);

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => false);
  suggestSpy.mockReset();
  suggestSpy.mockReturnValue(W_R7E4_WITH_WARMUP as Workout);
  mocks.loadEngineHistory.mockReset().mockResolvedValue([]);
  mocks.loadTargets.mockReset().mockResolvedValue(targets());
  mocks.loadLibrary.mockReset().mockResolvedValue(L1_WITH_WARMUP);
  mocks.loadProfile.mockReset().mockResolvedValue(PROFILE);
  mocks.lastSyncedAt.mockReset().mockResolvedValue(null);
  mocks.refreshAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FEATURE = resolve(__dirname, "..");
const TODAY_CSS = readFileSync(resolve(FEATURE, "today.css"), "utf8");
const PREVIEW_CSS = readFileSync(resolve(FEATURE, "preview.css"), "utf8");

async function todayRoot(): Promise<HTMLElement> {
  renderSwitch({ initialEntries: ["/"] });
  await waitFor(() => expect(document.querySelector('[data-part="card-row"]')).not.toBeNull());
  await macrotask();
  return document.querySelector<HTMLElement>('[data-screen-id="UF-02.1"]')!;
}

async function previewRoot(): Promise<HTMLElement> {
  renderSwitch({ initialEntries: ["/?view=preview"] });
  await waitFor(() => expect(previewScreenRoot()).not.toBeNull());
  await waitFor(() => expect(document.querySelector('[data-part="preview-row"]')).not.toBeNull());
  return previewScreenRoot()!;
}

describe("AC1 state: both roots are plan-state pages", () => {
  it("Today", async () => {
    const root = await todayRoot();
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(root).toHaveClass("wl-page");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
  });

  it("Preview", async () => {
    const root = await previewRoot();
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(root).toHaveClass("wl-page");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
  });
});

describe("AC2 type: the hero title keeps its name", () => {
  it("the h1 is the hero with the CSS full stop and is named Today", async () => {
    const root = await todayRoot();
    const h1 = within(root).getByRole("heading", { level: 1, name: "Today" });
    expect(h1).toHaveClass("wl-type-hero", "wl-title--stop");
    expect(h1.textContent).toBe("Today");
  });
});

describe("AC3 one primary", () => {
  it("Today: Start is the only primary, an aria-hidden arrow ends it, and it is followed only by the quick link", async () => {
    const root = await todayRoot();
    const primaries = root.querySelectorAll(".wl-button--primary");
    expect(primaries).toHaveLength(1);
    const start = within(root).getByRole("link", { name: "Start workout" });
    expect(start).toBe(primaries[0]);
    expect(start.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    // T-0638 (D-0217): the quick link follows Start; Start is the last primary control.
    expect(root.lastElementChild).toBe(start.nextElementSibling);
    expect(start.nextElementSibling).toHaveAttribute("data-part", "quick");
    expect(start).toHaveAttribute("href", "/session/setup");
  });

  it("Preview: Start is the only primary and the last child; Back is a text button", async () => {
    const root = await previewRoot();
    const primaries = root.querySelectorAll(".wl-button--primary");
    expect(primaries).toHaveLength(1);
    const start = within(root).getByRole("link", { name: "Start workout" });
    expect(start).toBe(primaries[0]);
    expect(start.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(root.lastElementChild).toBe(start);
    expect(within(root).getByRole("link", { name: "Back" })).toHaveClass("wl-button--text");
  });
});

describe("AC5 no cards: the suggestion card is a section, hairline rows and outline chips", () => {
  it("rows are .wl-row, chips are .wl-chip labels, See all is a text button, nothing is a box", async () => {
    const root = await todayRoot();
    const card = root.querySelector<HTMLElement>('[data-part="card"]')!;
    expect(card.className).toBe("wl-today-card");
    expect(card.querySelector("h2")).toHaveClass("wl-type-section");
    const rows = card.querySelectorAll('[data-part="card-row"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toHaveClass("wl-row");
    const chips = card.querySelectorAll('[data-part="card-chip"]');
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip).toHaveClass("wl-chip");
      expect(chip.tagName).toBe("LI");
    }
    expect(within(card).getByRole("link", { name: "See all" })).toHaveClass("wl-button--text");
    expect(card.querySelectorAll("button")).toHaveLength(0);
  });

  it("the skeleton is the same unboxed section", async () => {
    mocks.loadProfile.mockReset().mockReturnValue(new Promise(() => {}));
    renderSwitch({ initialEntries: ["/"] });
    const busy = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-part="card"][aria-busy="true"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(busy.className).toBe("wl-today-card");
  });

  it("Preview rows are .wl-row with an aria-hidden trailing arrow; the chips are .wl-chip", async () => {
    const root = await previewRoot();
    const rows = root.querySelectorAll('[data-part="preview-row"]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveClass("wl-row");
      expect(row.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(within(row as HTMLElement).getAllByRole("link")).toHaveLength(1);
    }
    for (const chip of root.querySelectorAll('[data-part="preview-chip"]')) {
      expect(chip).toHaveClass("wl-chip");
    }
    expect(screen.getByRole("list", { name: "Suggested exercises" })).toBeTruthy();
  });
});

describe("AC7 the stylesheets: rem type, variables only, no legacy colour", () => {
  const sheets = [
    ["today.css", TODAY_CSS],
    ["preview.css", PREVIEW_CSS],
  ] as const;
  // Comments may name things (and px sizes of targets); the rules are what is read.
  const rules = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

  it.each(sheets)(
    "%s has no px font-size, no raw colour and no legacy colour variable",
    (_n, css) => {
      const code = rules(css);
      expect(code).not.toMatch(/font-size:\s*[\d.]+px/);
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(code).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch)\(/);
      expect(code).not.toMatch(/--wl-color-/);
      expect(code).not.toMatch(/--wl-font-(?:display|body)/);
    },
  );

  it.each(sheets)("%s sets no letter-spacing or word-spacing and no :disabled", (_n, css) => {
    const code = rules(css);
    expect(code).not.toMatch(/(?:letter|word)-spacing/);
    expect(code).not.toMatch(/:disabled/);
  });

  it.each(sheets)("%s adds no transition or animation", (_n, css) => {
    expect(rules(css)).not.toMatch(/\b(?:transition|animation)\b/);
  });

  it("the skeleton bars use the state's raise, not the legacy surface-2", () => {
    expect(rules(TODAY_CSS)).toMatch(/\.wl-today-card__bar\s*\{[^}]*var\(--wl-raise\)/);
    expect(rules(PREVIEW_CSS)).toMatch(/\.wl-preview__bar\s*\{[^}]*var\(--wl-raise\)/);
  });

  it("the Resume card of UF-09 is restyled from here, doubled with .wl-today to beat uf-09.css", () => {
    const code = rules(TODAY_CSS);
    expect(code).toMatch(/\.wl-today \.wl-resume-card\s*\{[^}]*background:\s*none/);
    // T-0665: the Resume button is the shared secondary; no hand-made outline button remains.
    expect(code).not.toMatch(/wl-resume-card__action/);
  });
});
