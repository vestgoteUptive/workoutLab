// T-0600 UF-08.2 and UF-08.5 Cobalt plan restyle (D-0208, D-0210, D-0211 §5, D-0216). Structure and
// stylesheet guards; the computed colours, sizes, contrast and the canvas compare are in
// tests/e2e/uf-08-setup.spec.ts. `Suggested` is rendered on its own inside a router.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Workout } from "@workoutlab/engine";
import { Suggested, type SuggestedProps } from "../Suggested.js";
import { fLibrary, LOCALE } from "./fixtures.js";
import { wR7E4 } from "./workouts.js";

const css = readFileSync(resolve(__dirname, "../uf-08.css"), "utf8");

afterEach(() => {
  cleanup();
});

function props(workout: Workout, overrides: Partial<SuggestedProps> = {}): SuggestedProps {
  return {
    workout,
    library: fLibrary(),
    locale: LOCALE,
    onRemove: vi.fn(),
    onShuffle: vi.fn(),
    onBudget: vi.fn(),
    ...overrides,
  };
}

function show(overrides: Partial<SuggestedProps> = {}, sheet = false) {
  const entry = sheet
    ? { pathname: "/session/setup", search: "?step=suggested", state: { wlAddSheet: true } }
    : "/session/setup?step=suggested";
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Suggested
        {...props(wR7E4(), {
          catalog: fLibrary(),
          onAdd: () => null,
          onMove: vi.fn(),
          ...overrides,
        })}
      />
    </MemoryRouter>,
  );
}

const root = () => document.querySelector<HTMLElement>('[data-screen-id="UF-08.2"]')!;
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-part="item-row"]'));

/** The declarations of the first rule whose selector contains `selector`. */
function rule(selector: string): string {
  const i = css.indexOf(selector);
  expect(i, selector).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf("{", i), css.indexOf("}", i));
}

describe("AC1 the roots are plan", () => {
  it("UF-08.2 carries data-wl-state=plan and .wl-page", () => {
    show();
    expect(root().getAttribute("data-wl-state")).toBe("plan");
    expect(root().classList.contains("wl-page")).toBe(true);
  });

  it("the open Add sheet is a .wl-sheet in plan, with a body-level aria-hidden scrim", () => {
    show({}, true);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-wl-state")).toBe("plan");
    expect(dialog.classList.contains("wl-sheet")).toBe(true);
    expect(dialog.getAttribute("data-screen-id")).toBe("UF-08.5");
    const scrim = document.querySelector(".wl-sheet-scrim");
    expect(scrim).not.toBeNull();
    expect(scrim!.getAttribute("aria-hidden")).toBe("true");
    expect(dialog.querySelector(".wl-sheet__grabber")).not.toBeNull();
  });
});

describe("AC1 items are hairline .wl-row", () => {
  it("each item is a .wl-row li with the index hidden, Swap a text button, Remove an aria-hidden cross", () => {
    show();
    expect(rows()).toHaveLength(3);
    for (const row of rows()) {
      expect(row.classList.contains("wl-row")).toBe(true);
      expect(row.querySelector(".wl-uf08__index")!.getAttribute("aria-hidden")).toBe("true");
      const swap = row.querySelector<HTMLElement>('[data-part="swap"]')!;
      expect(swap.classList.contains("wl-button--text")).toBe(true);
      const remove = row.querySelector<HTMLElement>('[data-part="remove"]')!;
      expect(remove.textContent).toBe("");
      expect(remove.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    }
    expect(screen.getByRole("button", { name: "Remove Bench press" })).toBeInTheDocument();
  });

  it("the why chips and the Favorite tag are non-interactive outline .wl-chip", () => {
    show({ favoriteIds: ["bench-press"] });
    const list = document.querySelector('[data-part="session-chips"]')!;
    expect(list.tagName).toBe("UL");
    const chips = Array.from(list.querySelectorAll("li"));
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) {
      expect(c.classList.contains("wl-chip")).toBe(true);
      expect(c.querySelector("button, a, input")).toBeNull();
      expect(c.hasAttribute("tabindex")).toBe(false);
    }
    const fav = document.querySelector<HTMLElement>('[data-part="row-favorite"]')!;
    expect(fav.classList.contains("wl-chip")).toBe(true);
    expect(fav.tagName).toBe("SPAN");
    expect(rule(".wl-uf08[data-wl-state] :is(.wl-uf08__why-chip")).toMatch(
      /pointer-events:\s*none/,
    );
  });

  it("the Skipping line is a plain paragraph with an aria-hidden icon", () => {
    show({ avoidAreas: ["quads"] });
    const line = document.querySelector('[data-part="skipping"]')!;
    expect(line).toHaveTextContent(/^Skipping today: Quads/);
    expect(line.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("one .wl-button--primary: Looks good, with an aria-hidden arrow; Shuffle and Add are secondary", () => {
    show();
    const primaries = root().querySelectorAll(".wl-button--primary");
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(screen.getByRole("button", { name: "Looks good" }));
    expect(primaries[0]!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Shuffle" }).className).toContain(
      "wl-button--secondary",
    );
    expect(screen.getByRole("button", { name: "Add exercise" }).className).toContain(
      "wl-button--secondary",
    );
  });
});

describe("AC3 Reorder: the moved row", () => {
  it("only the row just moved is data-moved, the handle is an aria-hidden icon, Done clears it", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
    expect(document.querySelector("[data-moved]")).toBeNull();
    for (const row of rows()) {
      expect(row.querySelector(".wl-uf08__handle")!.getAttribute("aria-hidden")).toBe("true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Move Inverted row down" }));
    const moved = Array.from(document.querySelectorAll("[data-moved]"));
    expect(moved).toHaveLength(1);
    expect(moved[0]!.getAttribute("data-id")).toBe("inverted-row");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(document.querySelector("[data-moved]")).toBeNull();
  });

  it("the moved row paints --wl-raise with --wl-ink, and its captions --wl-ink-on-raise", () => {
    const moved = rule('.wl-uf08[data-wl-state] .wl-uf08__row--reorder[data-moved="true"]');
    expect(moved).toMatch(/background:\s*var\(--wl-raise\)/);
    expect(moved).toMatch(/color:\s*var\(--wl-ink\)/);
    expect(rule('.wl-uf08__row--reorder[data-moved="true"] :is(')).toMatch(
      /color:\s*var\(--wl-ink-on-raise\)/,
    );
  });
});

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
    // `.wl-uf08__status:empty` still has display:none (see the note in uf-08.css; follow-up).
    for (const sel of [".wl-uf08__removed:empty", ".wl-uf08__sheet-status:empty"]) {
      expect(rule(sel)).not.toMatch(/display:\s*none/);
    }
    expect(css).not.toMatch(/position:\s*sticky/);
    expect(css).not.toMatch(/\.wl-uf08__primary[^{]*\{[^}]*position:\s*fixed/);
  });

  it("the sheet has no transition and the file's transitions are still Reorder's only", () => {
    expect(rule(".wl-sheet.wl-uf08__sheet[data-wl-state]")).not.toMatch(/transition/);
    const transitions = css.match(/^\s*transition:[^;]*;/gm) ?? [];
    expect(transitions.map((t) => t.trim())).toEqual([
      "transition: background-color 150ms;",
      "transition: none;",
    ]);
  });

  it("the Add sheet search is a .wl-input and its rows are .wl-row", () => {
    show({ favoriteIds: ["bench-press"] }, true);
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
