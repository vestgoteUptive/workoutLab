// T-0600 UF-08.5 Cobalt plan restyle (D-0208, D-0210, D-0211 §5, D-0216). Stylesheet guards and the
// Add sheet's structure; the computed colours, sizes, contrast and the canvas compare are in
// tests/e2e/uf-08-setup.spec.ts. T-0998: the exercise list's own cases (rows, Reorder, tags on
// UF-08.2) went with the list; the area plan's are in cobalt-plan.test.tsx.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AddExerciseSheet } from "../AddExerciseSheet.js";
import { fLibrary } from "./fixtures.js";
import { wR7E4 } from "./workouts.js";

const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");

afterEach(() => {
  cleanup();
});

/** The declarations of the first rule whose selector contains `selector`. */
function rule(selector: string): string {
  const i = css.indexOf(selector);
  expect(i, selector).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf("{", i), css.indexOf("}", i));
}

describe("AC2 the time bar has no warn", () => {
  it("the warm-up segment is --wl-ink-muted, items --wl-ink, the track --wl-raise", () => {
    expect(rule('.wl-uf08__seg[data-segment="warmup"]')).toMatch(
      /background:\s*var\(--wl-ink-muted\)/,
    );
    expect(rule(".wl-uf08__seg {")).toMatch(/background:\s*var\(--wl-ink\)/);
    expect(rule(".wl-uf08__bar {")).toMatch(/background:\s*var\(--wl-raise\)/);
  });

  it("the file reads no legacy colour variable and has no warn rule", () => {
    expect(css).not.toMatch(/--wl-color-(?!plan-)/);
    expect(css).not.toMatch(/seg--warn|--wl-color-warn/);
  });
});

describe("AC6 guards", () => {
  it("no legacy no-state rule, no display:none on a live region, no sticky or fixed primary", () => {
    expect(css).not.toMatch(/:not\(\[data-wl-state\]\)/);
    for (const sel of [
      ".wl-uf08__status:empty",
      ".wl-uf08__removed:empty",
      ".wl-uf08__sheet-status:empty",
    ]) {
      expect(rule(sel)).not.toMatch(/display:\s*none/);
    }
    expect(css).not.toMatch(/position:\s*sticky/);
    expect(css).not.toMatch(/\.wl-uf08__primary[^{]*\{[^}]*position:\s*fixed/);
  });

  it("the sheet has no transition and the file has none left (Reorder's was the only one)", () => {
    expect(rule(".wl-sheet.wl-uf08__sheet[data-wl-state]")).not.toMatch(/transition/);
    expect(css.match(/^\s*transition:[^;]*;/gm) ?? []).toEqual([]);
  });

  it("the Add sheet search is a .wl-input and its rows are .wl-row", () => {
    render(
      <MemoryRouter initialEntries={["/session/setup?step=area&area=chest"]}>
        <AddExerciseSheet
          catalog={fLibrary()}
          items={wR7E4().plan.items}
          lead="12 of 30 min left."
          favoriteIds={["bench-press"]}
          onAdd={() => null}
          onClose={() => {}}
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    const search = within(dialog).getByRole("searchbox");
    expect(search.classList.contains("wl-input")).toBe(true);
    const picks = dialog.querySelectorAll('[data-part="pick-row"]');
    expect(picks.length).toBeGreaterThan(0);
    for (const p of Array.from(picks)) expect(p.classList.contains("wl-row")).toBe(true);
    expect(dialog.querySelector('[data-part="favorite-tag"]')!.classList.contains("wl-chip")).toBe(
      true,
    );
  });
});
