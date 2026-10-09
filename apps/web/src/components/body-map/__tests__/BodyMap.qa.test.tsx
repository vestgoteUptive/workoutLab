// T-0300d QA: closes gaps found by mutation testing C-01 (UF-02.1 compact, UF-10.1 full).
// Expected values come from the spec (c-01-body-map.md, the ticket's AC-D3/D4/D9, D-0060), not from
// the component's own catalogue. Legend copy is read from @workoutlab/design-tokens (AC-D7).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { coverageLegend } from "@workoutlab/design-tokens";
import { AREAS, type Area } from "@workoutlab/shared";
import { BodyMap } from "../index.js";
import type { BodyMapArea } from "../BodyMap.js";
import { mixedFixture, withArea, zeroFixture } from "./fixtures.js";
import {
  areaEl,
  fillOf,
  injectBodyMapCss,
  mapRoot,
  mockMatchMedia,
  removeMatchMedia,
  renderInRouter,
} from "./test-helpers.js";

const VARIANTS = ["compact", "full"] as const;

/** Display name per the spec's examples ("Hamstrings", "Chest"): the area id, capitalised. */
const displayName = (area: Area): string => area.charAt(0).toUpperCase() + area.slice(1);

const srFor = (step: number): string => {
  const sr = coverageLegend.find((e) => e.step === step)!.srLabel;
  return sr.charAt(0).toLowerCase() + sr.slice(1);
};

/** The visible numbers AC-D3 requires for `mixedFixture` (one decimal only when fractional). */
const MIXED_LOAD_TEXT: Record<Area, string> = {
  chest: "0",
  back: "7.5",
  shoulders: "8",
  arms: "7.3",
  core: "0",
  glutes: "16",
  quads: "3",
  hamstrings: "19.9",
  calves: "10",
};

beforeEach(() => mockMatchMedia(false));
afterEach(() => removeMatchMedia());

describe("AC-D4 accessible name for all nine areas (QA)", () => {
  it("AC-D4: every full area button is named '<Area>, <load> of <target> hard sets, <srLabel>'", () => {
    renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(9);
    for (const a of mixedFixture) {
      const name = `${displayName(a.area)}, ${MIXED_LOAD_TEXT[a.area]} of ${a.target} hard sets, ${srFor(a.coverageStep)}`;
      expect(screen.getByRole("button", { name })).toHaveAttribute("data-area", a.area);
    }
  });

  for (const variant of VARIANTS) {
    it(`AC-D3/D4 ${variant}: each area shows its own visible name`, () => {
      const { container } = renderInRouter(<BodyMap variant={variant} areas={mixedFixture} />);
      for (const area of AREAS) {
        expect(within(areaEl(container, area)).getByText(displayName(area))).toBeVisible();
      }
    });
  }
});

describe("AC-D1/D3 data is matched by area id, not position (QA)", () => {
  for (const variant of VARIANTS) {
    it(`AC-D1/D3 ${variant}: shuffled engine output still lands on the right areas`, () => {
      const shuffled = [...mixedFixture].reverse();
      const { container } = renderInRouter(<BodyMap variant={variant} areas={shuffled} />);
      for (const a of mixedFixture) {
        expect(fillOf(container, a.area).style.backgroundColor).toBe(
          `var(--wl-coverage-${a.coverageStep})`,
        );
        expect(
          within(areaEl(container, a.area)).getByText(`${MIXED_LOAD_TEXT[a.area]} / ${a.target}`),
        ).toBeVisible();
      }
    });
  }
});

// D-0060 §1 (the tile layout) is superseded by D-0207 §2: the labels sit in a 3-column grid in
// body order, and DOM order = visual order = tab order. §2–§8 stand.
const LABEL_ORDER = [
  "shoulders",
  "chest",
  "back",
  "arms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];

describe("D-0207 §2 label order and placement (QA)", () => {
  it("D-0207: DOM and tab order follow the body order; the grid has 3 columns", () => {
    const style = injectBodyMapCss();
    try {
      const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
      const tiles = Array.from(
        mapRoot(container).querySelectorAll<HTMLElement>('[data-part="label"]'),
      );
      expect(tiles.map((t) => t.dataset.area)).toEqual(LABEL_ORDER);
      expect([...LABEL_ORDER].sort()).toEqual([...AREAS].sort());
      expect(screen.getAllByRole("button").map((b) => b.dataset.area)).toEqual(LABEL_ORDER);

      const grid = Array.from((style.sheet as CSSStyleSheet).cssRules).find(
        (r): r is CSSStyleRule =>
          r instanceof CSSStyleRule && r.selectorText === ".wl-body-map__grid",
      )!;
      expect(grid.style.getPropertyValue("grid-template-columns")).toContain("repeat(3");
    } finally {
      style.remove();
    }
  });
});

describe("NFR-I18N-2 device locale by default (QA)", () => {
  it("AC-D3: with no locale prop, numbers use the device locale (simulated sv-SE device)", () => {
    const Real = Intl.NumberFormat;
    function DeviceNumberFormat(locales?: string | string[], options?: Intl.NumberFormatOptions) {
      return new Real(locales ?? "sv-SE", options);
    }
    Object.defineProperty(Intl, "NumberFormat", {
      configurable: true,
      writable: true,
      value: DeviceNumberFormat,
    });
    try {
      const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
      expect(within(areaEl(container, "back")).getByText("7,5 / 20")).toBeVisible();
      expect(screen.getByRole("button", { name: /^Back, 7,5 of 20 hard sets, / })).toBeTruthy();
    } finally {
      Object.defineProperty(Intl, "NumberFormat", {
        configurable: true,
        writable: true,
        value: Real,
      });
    }
  });
});

describe("AC-D9 loading shows no stale numbers to anyone (QA)", () => {
  for (const variant of VARIANTS) {
    it(`AC-D9 ${variant}: while loading, no area exposes a number visibly or by name`, () => {
      const { container } = renderInRouter(
        <BodyMap variant={variant} areas={mixedFixture} loading />,
      );
      for (const area of AREAS) {
        const el = areaEl(container, area);
        for (const node of [el, ...Array.from(el.querySelectorAll("*"))]) {
          expect(node.getAttribute("aria-label") ?? "").not.toMatch(/\d/);
        }
        expect(el.textContent ?? "").not.toMatch(/\d/);
      }
      if (variant === "full") {
        for (const b of screen.getAllByRole("button")) {
          expect(b.getAttribute("aria-label") ?? "").not.toMatch(/\d/);
        }
      }
    });
  }
});

describe("D-0060 §2 the UI never guesses a step (principle 3, QA)", () => {
  for (const bad of [-1, 5, 2.5]) {
    it(`D-0060 §2: coverageStep ${bad} renders neutral surface-2, not a coverage token`, () => {
      const areas = withArea(zeroFixture, {
        area: "quads",
        load: 30,
        target: 20,
        coverageStep: bad as BodyMapArea["coverageStep"],
        needsAttention: false,
      });
      const { container } = renderInRouter(<BodyMap variant="full" areas={areas} />);
      expect(fillOf(container, "quads").style.backgroundColor).toBe("var(--wl-raise)");
    });
  }

  it("D-0060 §2: an area missing from the engine output renders neutral, the rest unaffected", () => {
    const areas = mixedFixture.filter((a) => a.area !== "calves");
    const { container } = renderInRouter(<BodyMap variant="full" areas={areas} />);
    expect(fillOf(container, "calves").style.backgroundColor).toBe("var(--wl-raise)");
    expect(fillOf(container, "hamstrings").style.backgroundColor).toBe("var(--wl-coverage-1)");
  });
});
