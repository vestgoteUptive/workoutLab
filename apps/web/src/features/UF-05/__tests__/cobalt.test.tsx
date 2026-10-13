// T-0602 (D-0208 §2, D-0210, D-0211, D-0216; UF-08.3, UF-05.1): the Cobalt plan-state contract
// jsdom can read for the swap sheet: the sheet and scrim roots, the shared control classes, the
// tags, the plan sheet over a lift host, the states, the stylesheet guards and the contrast of
// every text pair (from tokens.json). The computed look, the 44 px targets, the arrow keys, axe
// colour contrast and the motion are proven in a real browser (tests/e2e/uf-05-swap.spec.ts).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import * as engine from "@workoutlab/engine";
import { tokens } from "@workoutlab/design-tokens";
import { candidate, w5, TZ } from "./fixtures.js";
import { freezeClock, mountSheet, rowIds, seedCache, signOut } from "./harness.js";
import { SwapSheet } from "../index.js";

const CSS = readFileSync(resolve(__dirname, "../uf-05.css"), "utf8");
const TSX = readFileSync(resolve(__dirname, "../SwapSheet.tsx"), "utf8");
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
  freezeClock();
  await seedCache();
});
afterEach(() => {
  cleanup();
  signOut();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AC1 the sheet is a plan sheet, even over lift", () => {
  it("the dialog is a plan-state .wl-sheet with a grabber, over an aria-hidden scrim", async () => {
    mountSheet(w5(), 1);
    const dialog = await screen.findByRole("dialog", { name: "Replace Barbell row" });
    expect(dialog).toHaveAttribute("data-wl-state", "plan");
    expect(dialog).toHaveClass("wl-sheet");
    expect(dialog.querySelector(".wl-sheet__grabber")).toHaveAttribute("aria-hidden", "true");
    const scrim = document.querySelector(".wl-sheet-scrim")!;
    expect(scrim).toHaveAttribute("aria-hidden", "true");
    expect(scrim.parentElement).toHaveAttribute("data-wl-state", "plan");
    expect(dialog.parentElement).toBe(scrim.parentElement);
    expect(document.querySelectorAll("[data-screen-id]")).toHaveLength(1);
  });

  it("over a lift host the sheet keeps plan on itself and the host keeps lift", async () => {
    render(
      <div data-wl-state="lift" data-testid="host">
        <SwapSheet workout={w5()} itemIndex={1} onApply={vi.fn()} onClose={vi.fn()} timeZone={TZ} />
      </div>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Replace Barbell row" });
    expect(screen.getByTestId("host")).toHaveAttribute("data-wl-state", "lift");
    expect(dialog).toHaveAttribute("data-wl-state", "plan");
    expect(dialog.closest('[data-wl-state="lift"]')).toBe(screen.getByTestId("host"));
  });

  it("the title is the section title and the areas are a label caption", async () => {
    mountSheet(w5(), 1);
    const dialog = await screen.findByRole("dialog", { name: "Replace Barbell row" });
    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveClass("wl-type-section");
    const caption = dialog.querySelector('[data-field="areas"]')!;
    expect(caption).toHaveClass("wl-type-label");
    expect(caption.textContent).toBe("Back");
  });
});

describe("AC2 options and chips use the shared controls", () => {
  it("each candidate is a .wl-option row on a native radio; the reasons are .wl-chip labels", async () => {
    mountSheet(w5(), 1);
    const ids = await rowIds();
    const group = screen.getByRole("radiogroup", { name: "Replacement" });
    for (const id of ids) {
      const rowEl = group.querySelector(`[data-id="${id}"]`)!;
      expect(rowEl.tagName).toBe("LABEL");
      expect(rowEl).toHaveClass("wl-option");
      expect(rowEl.querySelector('input[type="radio"]')).not.toBeNull();
      expect(rowEl.querySelector(".wl-option__tick")).toHaveAttribute("aria-hidden", "true");
    }
    expect(
      within(group)
        .getAllByRole("radio")
        .filter((r) => (r as HTMLInputElement).checked),
    ).toHaveLength(1);
    const reasons = screen.getByRole("radiogroup", { name: "Reason" });
    const chips = Array.from(reasons.querySelectorAll("label"));
    expect(chips).toHaveLength(5);
    for (const chip of chips) {
      expect(chip).toHaveClass("wl-chip");
      expect(chip.querySelector(".wl-chip__tick")).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getByRole("radio", { name: "Best match" })).toBeChecked();
  });

  it("Use is the one primary, Close a text button, and no legacy class is left", async () => {
    mountSheet(w5(), 1);
    await rowIds();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll(".wl-button--primary")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Use / })).toHaveClass("wl-button--primary");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("wl-button--text");
    expect(
      document.querySelectorAll(".wl-uf05__chip, .wl-uf05__use, .wl-uf05__close, .wl-uf05__tick"),
    ).toHaveLength(0);
  });
});

describe("AC3 the over-time tag", () => {
  it("only an over-time candidate carries the tag, with its words and the tag hook", async () => {
    vi.spyOn(engine, "rankSwaps").mockReturnValue([
      candidate("db-row", { bestMatch: true, fitsBudget: true }),
      candidate("lat-pulldown", { fitsBudget: false }),
    ]);
    mountSheet(w5(), 1);
    await rowIds();
    const over = document.querySelector('[data-id="lat-pulldown"] [data-tag="over-time"]')!;
    expect(over.textContent).toBe("Over your time");
    expect(over).toHaveClass("wl-uf05__tag");
    expect(document.querySelector('[data-id="db-row"] [data-tag="over-time"]')).toBeNull();
    expect(document.querySelector('[data-id="db-row"] [data-tag="best-match"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-tag="over-time"]')).toHaveLength(1);
  });

  it("the tag CSS: over-time is --wl-attention, a selected row and the hover fill take another colour", () => {
    expect(CSS).toMatch(
      /\.wl-uf05__tag\[data-tag="over-time"\]\s*\{\s*color:\s*var\(--wl-attention\)/,
    );
    expect(CSS).toMatch(
      /\.wl-uf05__row:has\(input:checked\) \.wl-uf05__tag\s*\{\s*color:\s*var\(--wl-on-selected\)/,
    );
    expect(CSS).toMatch(
      /\.wl-uf05__row:hover:not\(:has\(input:checked\)\) \.wl-uf05__tag\[data-tag="over-time"\]\s*\{\s*color:\s*var\(--wl-ink\)/,
    );
  });
});

describe("AC5 contrast and guards", () => {
  it.each([
    ["ink on bg", PLAN.ink, PLAN.bg, 4.5],
    ["ink-muted on bg (caption, facts)", PLAN["ink-muted"], PLAN.bg, 4.5],
    ["attention on bg (over-time tag)", PLAN.attention, PLAN.bg, 5.0],
    ["on-selected on selected (row block, tags)", PLAN["on-selected"], PLAN.selected, 4.5],
    ["ink on raise (hover row, tags)", PLAN.ink, PLAN.raise, 4.5],
    ["on-action on action (Use)", PLAN["on-action"], PLAN.action, 4.5],
  ])("%s", (_name, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("attention on the hover fill is below AA, which is why the hover rule exists", () => {
    expect(ratio(PLAN.attention, PLAN.raise)).toBeLessThan(4.5);
  });

  it("the stylesheet has no px font size, no raw colour, no transition and no legacy variable", () => {
    expect(CSS).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toMatch(/\btransition\s*:\s*(?!none)/);
    expect(CSS).not.toMatch(/var\(--wl-color-(bg-focus|text|surface|accent|line-strong)/);
    expect(TSX).not.toMatch(/bg-focus/);
  });

  it("every sheet rule is scoped to a sheet class (no bare element selectors)", () => {
    const selectors = [
      ...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/^([^{}@\s][^{}]*)\{/gm),
    ].map((m) => m[1]!.trim());
    for (const sel of selectors.flatMap((s) => s.split(","))) {
      expect(sel.trim(), sel).toMatch(/^\.wl-uf05/);
    }
  });
});

describe("AC7 the states render inside the plan sheet", () => {
  it("loading, empty and failed are in the plan dialog", async () => {
    vi.spyOn(engine, "rankSwaps").mockReturnValue([]);
    mountSheet(w5(), 1);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-wl-state", "plan");
    expect(screen.getByText("Loading alternatives…")).toBeInTheDocument();
    expect(await screen.findByText("No alternatives fit your equipment")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("data-wl-state", "plan");
    cleanup();
    await seedCache({ profile: null });
    mountSheet(w5(), 1);
    await waitFor(() =>
      expect(screen.getByText("Couldn't load alternatives.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-wl-state", "plan");
  });
});

describe("AC7 a click on the radio itself lands on it", () => {
  it("the sheet keeps no local radio rule: the shared main.css rule is the full-size target (T-0678)", () => {
    expect(CSS).not.toMatch(/input\[type="radio"\]/);
    expect(CSS).not.toMatch(/pointer-events/);
  });
});
