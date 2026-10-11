// T-0608 (D-0208, D-0210, D-0211, D-0225; UF-04.2 and the how-to sheet): the Cobalt plan-state
// contract jsdom can read: the roots, the figure beside the lists, the controls, the numbered
// steps, the sheet rules and the contrast of every text pair (from tokens.json). The computed
// look, the 44 px targets, axe and the motion are proven in a real browser (uf-04-figure.spec.ts,
// uf-04-library.spec.ts, uf-04-favorites.spec.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { tokens } from "@workoutlab/design-tokens";
import { createSelectSpy } from "../../../lib/offline/__tests__/select-spy.js";
import { en } from "../../../lib/i18n/en.js";
import { NOW, TZ, USER, seedSpy } from "./l1plus.js";

const spy = createSelectSpy();
vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: spy.from } }));
vi.mock("../../../lib/auth/auth-context.js", () => import("./auth-mock.js"));

const { refreshAll } = await import("../../../lib/offline/history.js");
const { freshOfflineDb, signIn, signOut } =
  await import("../../../lib/offline/__tests__/test-helpers.js");
const { ExerciseHowTo } = await import("../index.js");
const { mountAt, setOnline } = await import("./harness.js");

const UF04_CSS = readFileSync(resolve(__dirname, "../uf-04.css"), "utf8");
const HOWTO_CSS = readFileSync(resolve(__dirname, "../how-to.css"), "utf8");
const MAIN_CSS = readFileSync(resolve(__dirname, "../../../main.css"), "utf8");
const DETAIL_CSS = UF04_CSS.slice(UF04_CSS.indexOf("/* ---- UF-04.2 Detail"));
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

const mountDetail = async (id = "back-squat", name = "Back squat") => {
  await mountAt(`/library/${id}`);
  await screen.findByRole("heading", { level: 1, name });
  return document.querySelector('[data-screen-id="UF-04.2"]')!;
};

describe("AC1 state", () => {
  it("UF-04.2 is a plan-state page root with a stopped title and a label caption", async () => {
    const root = await mountDetail();
    expect(root).toHaveAttribute("data-wl-state", "plan");
    expect(root).toHaveClass("wl-page", "wl-uf04-detail");
    expect(root.querySelector("h1")).toHaveClass("wl-type-page-title", "wl-title--stop");
    expect(root.querySelector('[data-field="tagline"]')).toHaveClass("wl-type-label");
    expect(document.querySelectorAll("[data-wl-state]")).toHaveLength(1);
  });

  it("the open how-to is a plan-state sheet over a scrim, with a grabber", async () => {
    render(<ExerciseHowTo exerciseId="back-squat" onClose={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "How to: Back squat" });
    expect(dialog).toHaveAttribute("data-wl-state", "plan");
    expect(dialog).toHaveClass("wl-sheet");
    expect(dialog.querySelector(".wl-sheet__grabber")).not.toBeNull();
    const scrim = document.querySelector(".wl-sheet-scrim")!;
    expect(scrim).toHaveAttribute("aria-hidden", "true");
    // The scrim's own rule (main.css) needs a state ancestor: the wrapper is a plan root.
    expect(scrim.closest("[data-wl-state]")).toBe(document.querySelector(".wl-uf04-howto"));
    expect(document.querySelector(".wl-uf04-howto")).toHaveAttribute("data-wl-state", "plan");
    // The sheet rule: 28 px top radii (the token) and the plan.scrim scrim.
    expect(tokens.radius.sheet).toBe(28);
    expect(MAIN_CSS).toMatch(
      /\[data-wl-state\]\.wl-sheet \{[^}]*border-radius:\s*var\(--wl-radius-sheet\) var\(--wl-radius-sheet\) 0 0/,
    );
    expect(MAIN_CSS).toMatch(/\.wl-sheet-scrim \{[^}]*var\(--wl-color-plan-scrim\)/);
  });
});

describe("AC2 figure beside the lists", () => {
  it("the figure and the two lists share one row container; labels and lists keep their names", async () => {
    const root = await mountDetail();
    const fig = root.querySelector('[data-field="figure-card"]')!;
    expect(fig).toHaveClass("wl-uf04-detail__figure");
    expect(fig.querySelector("svg.wl-fig")).not.toBeNull();
    expect(fig.querySelector(".wl-uf04-detail__areas")).not.toBeNull();
    expect(within(fig as HTMLElement).getByText("Primary")).toBeVisible();
    expect(within(fig as HTMLElement).getByText("Secondary")).toBeVisible();
    for (const li of fig.querySelectorAll("li")) expect(li).toHaveClass("wl-uf04-detail__pill");
    expect(fig.querySelectorAll('li[data-weight="primary"]').length).toBeGreaterThan(0);
    expect(fig.querySelectorAll('li[data-weight="secondary"]').length).toBeGreaterThan(0);
    expect(DETAIL_CSS).toMatch(/\.wl-uf04-detail__figure \{[^}]*flex-wrap:\s*wrap/);
  });

  it("an exercise with no secondary areas has no Secondary label and no secondary swatch", async () => {
    const root = await mountDetail("goblet-squat", "Goblet squat");
    expect(within(root as HTMLElement).queryByText("Secondary")).not.toBeInTheDocument();
    expect(root.querySelector(".wl-uf04-detail__swatch--secondary")).toBeNull();
  });
});

describe("AC3 controls", () => {
  it("Favorite and Don't suggest are secondary buttons, never primary; offline both are aria-disabled", async () => {
    const root = await mountDetail();
    const fav = screen.getByRole("button", { name: en.uf04.favoriteName("Back squat") });
    const ex = screen.getByRole("button", { name: en.uf04.dontSuggestName("Back squat") });
    for (const b of [fav, ex]) {
      expect(b).toHaveClass("wl-button--secondary");
      expect(b).not.toHaveClass("wl-button--primary");
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b).not.toBeDisabled();
    }
    expect(fav).toHaveAttribute("aria-pressed", "false");
    expect(root.querySelector(".wl-button--primary")).toBeNull();
    expect(screen.getByRole("link", { name: en.uf04.myHistory })).toHaveClass("wl-button--text");
  });

  it("online they are not aria-disabled once the caches have loaded", async () => {
    setOnline(true);
    await mountDetail();
    const fav = screen.getByRole("button", { name: en.uf04.favoriteName("Back squat") });
    await vi.waitFor(() => expect(fav).not.toHaveAttribute("aria-disabled"));
    expect(fav).toHaveClass("wl-button--secondary");
  });
});

describe("steps, rows and the how-to body", () => {
  it("the instructions are numbered .wl-row items of one ordered list, in order", async () => {
    const root = await mountDetail();
    const ol = root.querySelector("ol")!;
    expect(ol).toHaveClass("wl-uf04-steps");
    expect([...ol.querySelectorAll(":scope > li")].map((li) => li.textContent)).toEqual([
      "Brace",
      "Sit down between your heels",
      "Drive up",
    ]);
    for (const li of ol.querySelectorAll("li")) expect(li).toHaveClass("wl-row");
    expect(HOWTO_CSS).toMatch(
      /\.wl-uf04-steps \.wl-row::before \{[^}]*content:\s*counter\(wl-step\)/,
    );
  });

  it("the sheet shows the same steps and a secondary Close", async () => {
    render(<ExerciseHowTo exerciseId="back-squat" onClose={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "How to: Back squat" });
    await within(dialog).findByText("Chest up");
    expect(dialog.querySelectorAll("ol.wl-uf04-steps > li.wl-row")).toHaveLength(3);
    const close = within(dialog).getByRole("button", { name: en.uf04.close });
    expect(close).toHaveClass("wl-button--secondary");
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
  });
});

describe("AC4 contrast, type, motion, scope", () => {
  it.each([
    ["ink on bg (title, names, rows, steps)", PLAN.ink, PLAN.bg, 4.5],
    ["ink-muted on bg (labels, hints, attribution, credit)", PLAN["ink-muted"], PLAN.bg, 4.5],
    [
      "on-selected on selected (primary pill, pressed Favorite)",
      PLAN["on-selected"],
      PLAN.selected,
      4.5,
    ],
    ["ink on bg (secondary pill, outline tag, button text)", PLAN.ink, PLAN.bg, 4.5],
    ["ink-muted on bg (disabled secondary label, offline hint)", PLAN["ink-muted"], PLAN.bg, 4.5],
    ["ink on raise (hovered row)", PLAN.ink, PLAN.raise, 4.5],
  ])("%s", (_n, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("the pill and button fills use the generic on-colours, never ink on a filled pill", () => {
    expect(DETAIL_CSS).toMatch(
      /\.wl-uf04-detail__pill\[data-weight="primary"\] \{[^}]*color:\s*var\(--wl-on-selected\)[^}]*background:\s*var\(--wl-selected\)/,
    );
    expect(DETAIL_CSS).toMatch(
      /\[aria-pressed="true"\] \{[^}]*color:\s*var\(--wl-on-selected\)[^}]*background:\s*var\(--wl-selected\)/,
    );
  });

  it("the sheet opens without a transition and the state cross-fade is instant under reduced motion", () => {
    expect(MAIN_CSS).toMatch(/\[data-wl-state\]\.wl-sheet \{[^}]*transition:\s*none/);
    expect(MAIN_CSS).toMatch(/\.wl-sheet-scrim \{[^}]*transition:\s*none/);
    expect(MAIN_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-wl-state\],\s*:root \{\s*transition:\s*none/,
    );
    for (const css of [DETAIL_CSS, HOWTO_CSS]) {
      expect(css).not.toMatch(/\b(transition|animation)\s*:/);
    }
  });

  it("no px font size, no raw colour, no legacy colour token in the new rules", () => {
    for (const css of [DETAIL_CSS, HOWTO_CSS]) {
      expect(css.length).toBeGreaterThan(500);
      expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/--wl-color-/);
    }
  });

  it("every layout rule is scoped to its own screen or sheet classes", () => {
    for (const [css, re] of [
      [DETAIL_CSS, /^\.wl-uf04-detail/],
      [HOWTO_CSS, /^\.wl-uf04-(howto|steps|cue)/],
    ] as const) {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
      const selectors = [...bare.matchAll(/^([^{}\s][^{}]*)\{/gm)]
        .map((m) => m[1]!.trim())
        .filter((x) => !x.startsWith("@media"));
      expect(selectors.length).toBeGreaterThan(5);
      for (const sel of selectors) {
        for (const part of sel.replace(/:is\([^)]*\)/g, "").split(",")) {
          expect(part.trim(), sel).toMatch(re);
        }
      }
    }
  });
});
