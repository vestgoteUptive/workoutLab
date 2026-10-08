// T-0300d C-01 Body map: AC-D1…AC-D9 (UF-02.1 compact, UF-10.1 full, UF-10.2 navigation).
// Expected legend copy is read from @workoutlab/design-tokens, never retyped (AC-D7).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { attentionLegend, coverageLegend, type CoverageStep } from "@workoutlab/design-tokens";
import { AREAS } from "@workoutlab/shared";
import { BodyMap } from "../index.js";
import { attentionFixture, mixedFixture, TARGETS, withArea, zeroFixture } from "./fixtures.js";
import {
  accessibleText,
  areaEl,
  CSS_PATH,
  fillOf,
  injectBodyMapCss,
  mapRoot,
  mockMatchMedia,
  removeMatchMedia,
  renderInRouter,
} from "./test-helpers.js";

const VARIANTS = ["compact", "full"] as const;
const WARN_OUTLINE = "2px solid var(--wl-color-warn)";

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(() => {
  removeMatchMedia();
  vi.restoreAllMocks();
});

describe("AC-D1 fill from coverageStep only (principle 3)", () => {
  // Each load/target pair would give a *different* step under the D-0013 thresholds.
  const cases: { step: CoverageStep; load: number }[] = [
    { step: 0, load: 20 },
    { step: 1, load: 19.9 },
    { step: 2, load: 1 },
    { step: 3, load: 0 },
    { step: 4, load: 5 },
  ];

  for (const variant of VARIANTS) {
    for (const { step, load } of cases) {
      it(`AC-D1 ${variant}: coverageStep ${step} fills var(--wl-color-coverage-${step})`, () => {
        const areas = withArea(zeroFixture, {
          area: "hamstrings",
          load,
          target: 20,
          coverageStep: step,
          needsAttention: false,
        });
        const { container } = renderInRouter(<BodyMap variant={variant} areas={areas} />);
        expect(fillOf(container, "hamstrings").style.backgroundColor).toBe(
          `var(--wl-color-coverage-${step})`,
        );
      });
    }
  }

  it("AC-D1: hamstrings {load: 19.9, target: 20, coverageStep: 1} is coverage-1, not derived", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    expect(fillOf(container, "hamstrings").style.backgroundColor).toBe(
      "var(--wl-color-coverage-1)",
    );
  });

  it("AC-D1: every area's fill follows its own coverageStep (mixed fixture)", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    for (const a of mixedFixture) {
      expect(fillOf(container, a.area).style.backgroundColor).toBe(
        `var(--wl-color-coverage-${a.coverageStep})`,
      );
    }
  });
});

describe("AC-D2 attention outline", () => {
  for (const variant of VARIANTS) {
    for (const step of [0, 4] as const) {
      it(`AC-D2 ${variant}: needsAttention on coverage-${step} draws a 2px warn outline, fill unchanged`, () => {
        const areas = withArea(zeroFixture, {
          area: "core",
          load: step === 0 ? 0 : 14,
          target: 12,
          coverageStep: step,
          needsAttention: true,
        });
        const { container } = renderInRouter(<BodyMap variant={variant} areas={areas} />);
        const fill = fillOf(container, "core");
        expect(fill.style.outline).toBe(WARN_OUTLINE);
        expect(fill.style.backgroundColor).toBe(`var(--wl-color-coverage-${step})`);
      });
    }

    it(`AC-D2 ${variant}: needsAttention false draws no warn stroke anywhere on the map`, () => {
      const { container } = renderInRouter(<BodyMap variant={variant} areas={mixedFixture} />);
      for (const area of AREAS) {
        const el = areaEl(container, area);
        for (const node of [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))]) {
          expect(node.getAttribute("style") ?? "").not.toContain("--wl-color-warn");
        }
      }
    });
  }

  it("AC-D2: the attention fixture outlines exactly the flagged areas", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={attentionFixture} />);
    for (const a of attentionFixture) {
      expect(fillOf(container, a.area).style.outline).toBe(a.needsAttention ? WARN_OUTLINE : "");
    }
  });
});

describe("AC-D3 numeric labels (NFR-A11Y-3)", () => {
  const expected: Record<string, string> = {
    back: "7.5 / 20",
    shoulders: "8 / 20",
    core: "0 / 16",
    arms: "7.3 / 20",
  };

  for (const variant of VARIANTS) {
    it(`AC-D3 ${variant}: all 9 areas show visible "load / target" text`, () => {
      const { container } = renderInRouter(<BodyMap variant={variant} areas={mixedFixture} />);
      for (const [area, text] of Object.entries(expected)) {
        const el = areaEl(container, area as (typeof AREAS)[number]);
        expect(within(el).getByText(text)).toBeVisible();
      }
      const values = mapRoot(container).querySelectorAll('[data-part="value"]');
      expect(values).toHaveLength(9);
    });
  }

  it("AC-D3: the decimal separator follows the locale (NFR-I18N-2)", () => {
    const { container } = renderInRouter(
      <BodyMap variant="full" areas={mixedFixture} locale="sv-SE" />,
    );
    expect(within(areaEl(container, "back")).getByText("7,5 / 20")).toBeInTheDocument();
  });
});

describe("AC-D4 accessible name (full)", () => {
  it('AC-D4: hamstrings {12, 16, 3, true} → "Hamstrings, 12 of 16 hard sets, under target, needs attention"', () => {
    renderInRouter(<BodyMap variant="full" areas={attentionFixture} />);
    expect(
      screen.getByRole("button", {
        name: "Hamstrings, 12 of 16 hard sets, under target, needs attention",
      }),
    ).toBeInTheDocument();
  });

  it('AC-D4: chest {0, 16, 0, false} → "Chest, 0 of 16 hard sets, no hard sets"', () => {
    renderInRouter(<BodyMap variant="full" areas={zeroFixture} />);
    expect(
      screen.getByRole("button", { name: "Chest, 0 of 16 hard sets, no hard sets" }),
    ).toBeInTheDocument();
  });

  it("AC-D4: every step reads its srLabel from coverageLegend, and there are 9 area buttons", () => {
    renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    expect(screen.getAllByRole("button")).toHaveLength(9);
    const quads = screen.getByRole("button", { name: /^Quads, 3 of 20 hard sets, / });
    const sr1 = coverageLegend[1]!.srLabel;
    expect(quads).toHaveAccessibleName(
      `Quads, 3 of 20 hard sets, ${sr1.charAt(0).toLowerCase()}${sr1.slice(1)}`,
    );
    const glutes = screen.getByRole("button", { name: /^Glutes, 16 of 16 hard sets, / });
    expect(glutes.getAttribute("aria-label")?.toLowerCase()).toContain(
      coverageLegend[4]!.srLabel.toLowerCase(),
    );
  });
});

describe("AC-D5 navigation (D-0045 §4)", () => {
  const cases = [
    { how: "click", act: (el: HTMLElement) => fireEvent.click(el) },
    { how: "Enter", act: (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter" }) },
    {
      how: "Space",
      act: (el: HTMLElement) => {
        fireEvent.keyDown(el, { key: " " });
        fireEvent.keyUp(el, { key: " " });
      },
    },
  ];

  for (const { how, act } of cases) {
    it(`AC-D5 full: ${how} on hamstrings calls onSelectArea("hamstrings") once and lands on /balance/hamstrings (UF-10.2)`, () => {
      const onSelectArea = vi.fn();
      renderInRouter(
        <BodyMap variant="full" areas={mixedFixture} onSelectArea={onSelectArea} />,
        "/balance",
      );
      act(screen.getByRole("button", { name: /^Hamstrings,/ }));
      expect(onSelectArea).toHaveBeenCalledTimes(1);
      expect(onSelectArea).toHaveBeenCalledWith("hamstrings");
      expect(screen.getByTestId("location")).toHaveTextContent("/balance/hamstrings");
    });
  }

  it("AC-D5 full: Enter/Space cancel the native activation, so a real key press selects once", () => {
    renderInRouter(<BodyMap variant="full" areas={mixedFixture} />, "/balance");
    const btn = screen.getByRole("button", { name: /^Chest,/ });
    // fireEvent returns false when the handler called preventDefault().
    expect(fireEvent.keyDown(btn, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyUp(btn, { key: " " })).toBe(false);
  });

  it("AC-D5 compact: the whole map is one link to /balance (UF-10.1); areas aren't in the tab order", () => {
    const { container } = renderInRouter(<BodyMap variant="compact" areas={mixedFixture} />);
    const root = mapRoot(container);
    const links = within(root).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/balance");
    expect(links[0]).toHaveAccessibleName();
    expect(within(root).queryAllByRole("button")).toHaveLength(0);
    const focusable = root.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    expect(Array.from(focusable)).toEqual([links[0]]);
    for (const area of AREAS) expect(links[0]!.contains(areaEl(container, area))).toBe(true);
    fireEvent.click(links[0]!);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/balance$/);
  });
});

describe("AC-D6 hit area and focus style (NFR-A11Y-2)", () => {
  it("AC-D6: every full area button has computed min-width and min-height ≥ 44px", () => {
    const style = injectBodyMapCss();
    try {
      renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(9);
      for (const b of buttons) {
        const cs = getComputedStyle(b);
        expect(parseFloat(cs.minWidth)).toBeGreaterThanOrEqual(44);
        expect(parseFloat(cs.minHeight)).toBeGreaterThanOrEqual(44);
        expect(cs.minWidth.endsWith("px")).toBe(true);
        expect(cs.minHeight.endsWith("px")).toBe(true);
      }
    } finally {
      style.remove();
    }
  });

  it("AC-D6: the focus style is a 2px accent outline, offset 2px, and never warn", () => {
    const style = injectBodyMapCss();
    try {
      const sheet = style.sheet as CSSStyleSheet;
      const rules = Array.from(sheet.cssRules).filter(
        (r): r is CSSStyleRule =>
          r instanceof CSSStyleRule &&
          r.selectorText.split(",").some((s) => s.trim() === ".wl-body-map__area:focus-visible"),
      );
      expect(rules).toHaveLength(1);
      const decl = rules[0]!.style;
      expect(decl.getPropertyValue("outline")).toBe("2px solid var(--wl-color-accent)");
      expect(decl.getPropertyValue("outline-offset")).toBe("2px");
      expect(rules[0]!.cssText).not.toContain("warn");
    } finally {
      style.remove();
    }
  });
});

describe("AC-D7 legend from tokens", () => {
  const visibleLabels = [...coverageLegend.map((e) => e.label), attentionLegend.label];
  const srLabels = [...coverageLegend.map((e) => e.srLabel), attentionLegend.srLabel];

  for (const variant of VARIANTS) {
    it(`AC-D7 ${variant}: a "Coverage legend" list holds 6 items: visible label, srLabel for screen readers`, () => {
      renderInRouter(<BodyMap variant={variant} areas={mixedFixture} />);
      const list = screen.getByRole("list", { name: "Coverage legend" });
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(6);
      expect(
        items.map((li) => li.querySelector('[data-part="legend-label"]')?.textContent),
      ).toEqual(visibleLabels);
      expect(items.map((li) => accessibleText(li))).toEqual(srLabels);
      for (const li of items) {
        const swatch = li.querySelector<HTMLElement>('[data-part="swatch"]');
        expect(swatch).not.toBeNull();
        expect(swatch).toHaveAttribute("aria-hidden", "true");
      }
      coverageLegend.forEach((e, i) => {
        expect(
          items[i]!.querySelector<HTMLElement>('[data-part="swatch"]')!.style.backgroundColor,
        ).toBe(`var(--wl-color-${e.token})`);
      });
      const last = items[5]!.querySelector<HTMLElement>('[data-part="swatch"]')!;
      expect(last.style.backgroundColor).toBe("transparent");
      expect(last.style.outline).toBe(WARN_OUTLINE);
    });
  }
});

describe("AC-D8 zero history + offline", () => {
  for (const variant of VARIANTS) {
    it(`AC-D8 ${variant}: 9 zero areas are coverage-0, read "0 / <target>", legend shown`, () => {
      const { container } = renderInRouter(<BodyMap variant={variant} areas={zeroFixture} />);
      for (const area of AREAS) {
        expect(fillOf(container, area).style.backgroundColor).toBe("var(--wl-color-coverage-0)");
        expect(within(areaEl(container, area)).getByText(`0 / ${TARGETS[area]}`)).toBeVisible();
      }
      expect(screen.getByRole("list", { name: "Coverage legend" })).toBeVisible();
    });
  }

  it("AC-D8: renders the same with no network (no fetch, tokens bundled)", () => {
    const online = renderInRouter(<BodyMap variant="full" areas={zeroFixture} />);
    // BodyFigure's per-instance hatch id (useId) differs between two renders; nothing else may.
    const norm = (html: string) => html.replace(/wl-fig-hatch-[^"')#;\s]*/g, "wl-fig-hatch");
    const onlineHtml = norm(mapRoot(online.container).outerHTML);
    online.unmount();

    const fetchSpy = vi.fn(() => Promise.reject(new TypeError("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    try {
      const offline = renderInRouter(<BodyMap variant="full" areas={zeroFixture} />);
      expect(norm(mapRoot(offline.container).outerHTML)).toBe(onlineHtml);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      vi.unstubAllGlobals();
    }
    // Nothing remote in the component's CSS: no url(), no @import (fonts/tokens are bundled).
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).not.toMatch(/url\(|@import/);
  });
});

describe("AC-D9 loading", () => {
  for (const variant of VARIANTS) {
    it(`AC-D9 ${variant}: loading fills 9 areas with surface-2, no numbers, legend visible`, () => {
      const { container } = renderInRouter(
        <BodyMap variant={variant} areas={mixedFixture} loading />,
      );
      for (const area of AREAS) {
        expect(fillOf(container, area).style.backgroundColor).toBe("var(--wl-color-surface-2)");
      }
      expect(mapRoot(container).querySelectorAll('[data-part="value"]')).toHaveLength(0);
      expect(mapRoot(container).textContent).not.toMatch(/\d+ \/ \d+/);
      expect(screen.getByRole("list", { name: "Coverage legend" })).toBeVisible();
    });

    it(`AC-D9 ${variant}: under prefers-reduced-motion: reduce no element has an animation`, () => {
      mockMatchMedia(true);
      const { container } = renderInRouter(<BodyMap variant={variant} loading />);
      for (const el of Array.from(mapRoot(container).querySelectorAll<HTMLElement>("*"))) {
        expect(el.style.animation).toBe("");
        expect(el.style.animationName).toBe("");
      }
    });
  }

  it("AC-D9: the probe is sound, since loading does pulse when motion is allowed", () => {
    mockMatchMedia(false);
    const { container } = renderInRouter(<BodyMap variant="full" loading />);
    const animated = Array.from(mapRoot(container).querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.style.animation !== "",
    );
    expect(animated.length).toBe(9);
  });

  it("AC-D9: the stylesheet also switches animation off under prefers-reduced-motion", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none !important;/,
    );
  });
});
