// T-0557 C-01 silhouette layout (D-0207 §2; spec docs/specs/body-map-silhouette.md AC-6…AC-9).
// BodyFigure is aria-hidden, so the text equivalent is the label grid asserted here too.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { BodyMap } from "../index.js";
import type { BodyMapArea } from "../BodyMap.js";
import { mixedFixture, zeroFixture } from "./fixtures.js";
import {
  areaEl,
  fillOf,
  injectBodyMapCss,
  mapRoot,
  mockMatchMedia,
  removeMatchMedia,
  renderInRouter,
} from "./test-helpers.js";

beforeEach(() => mockMatchMedia(false));
afterEach(() => removeMatchMedia());

const regions = (root: HTMLElement, area: string): SVGPathElement[] =>
  Array.from(root.querySelectorAll<SVGPathElement>(`svg path.wl-fig__region[data-area="${area}"]`));

const classes = (el: Element): string => el.getAttribute("class") ?? "";

const sparse: BodyMapArea[] = [
  { area: "calves", load: 9, target: 12, coverageStep: 3, needsAttention: false },
  { area: "chest", load: 30, target: 16, coverageStep: 7 as 4, needsAttention: false },
  { area: "back", load: 20, target: 20, coverageStep: 4, needsAttention: true },
];

describe("AC-1 region styles come straight from coverageStep and needsAttention", () => {
  it("calves --step-3; chest (step 7) neutral; back --step-4 plus attention, label ring and name", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={sparse} />);
    const root = mapRoot(container);
    const calves = regions(root, "calves");
    expect(calves.length).toBeGreaterThanOrEqual(2);
    for (const p of calves) expect(classes(p)).toContain("wl-fig__region--step-3");
    for (const p of regions(root, "chest")) {
      expect(classes(p)).toContain("wl-fig__region--none");
      expect(classes(p)).not.toMatch(/step-/);
    }
    const back = regions(root, "back");
    expect(back.length).toBeGreaterThanOrEqual(1);
    for (const p of back) {
      expect(classes(p)).toContain("wl-fig__region--step-4");
      expect(classes(p)).toContain("wl-fig__region--attention");
    }
    // The halo (warn stroke, then surface gap) is drawn for the flagged area only.
    expect(root.querySelectorAll("svg .wl-fig__halo-warn")).toHaveLength(back.length);
    expect(root.querySelectorAll("svg .wl-fig__halo-gap")).toHaveLength(back.length);
    // Unflagged areas have no attention class.
    for (const p of calves) expect(classes(p)).not.toContain("attention");
    // Label swatch: warn ring, and the accessible name says so.
    expect(fillOf(container, "back").style.outline).toBe("2px solid var(--wl-color-warn)");
    expect(fillOf(container, "calves").style.outline).toBe("");
    expect(screen.getByRole("button", { name: /^Back,.*, needs attention$/ })).toBeInTheDocument();
    // A missing area (no data at all) is neutral too.
    for (const p of regions(root, "quads")) expect(classes(p)).toContain("--none");
  });

  it("every area's regions follow its own step (mixed fixture)", () => {
    const { container } = renderInRouter(<BodyMap variant="compact" areas={mixedFixture} />);
    for (const a of mixedFixture) {
      for (const p of regions(mapRoot(container), a.area)) {
        expect(classes(p)).toContain(`wl-fig__region--step-${a.coverageStep}`);
      }
    }
  });

  it("the figure is aria-hidden and loading draws every region neutral with no halo", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={sparse} loading />);
    const root = mapRoot(container);
    expect(root.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(root.querySelectorAll('svg path[class*="--step-"]')).toHaveLength(0);
    expect(root.querySelectorAll("svg .wl-fig__halo-warn")).toHaveLength(0);
    expect(root.className).toContain("wl-body-map--pulse");
  });

  it("loading pulse class is absent under reduced motion", () => {
    mockMatchMedia(true);
    const { container } = renderInRouter(<BodyMap variant="full" loading />);
    expect(mapRoot(container).className).not.toContain("pulse");
  });
});

describe("AC-2 full: nine 44px label buttons; a region tap selects once", () => {
  it("9 buttons with min 44 x 44 via CSS; both calves paths call onSelectArea('calves') once each", () => {
    const style = injectBodyMapCss();
    try {
      const onSelectArea = vi.fn();
      const { container } = renderInRouter(
        <BodyMap variant="full" areas={mixedFixture} onSelectArea={onSelectArea} />,
        "/balance",
      );
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(9);
      for (const b of buttons) {
        expect(parseFloat(getComputedStyle(b).minWidth)).toBeGreaterThanOrEqual(44);
        expect(parseFloat(getComputedStyle(b).minHeight)).toBeGreaterThanOrEqual(44);
      }
      const calves = regions(mapRoot(container), "calves");
      expect(calves.length).toBe(2);
      for (const p of calves) {
        onSelectArea.mockClear();
        fireEvent.click(p);
        expect(onSelectArea).toHaveBeenCalledTimes(1);
        expect(onSelectArea).toHaveBeenCalledWith("calves");
        expect(screen.getByTestId("location")).toHaveTextContent("/balance/calves");
      }
    } finally {
      style.remove();
    }
  });

  it("nothing inside the figure is focusable", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    const figure = mapRoot(container).querySelector('[data-part="figure"]')!;
    expect(figure.querySelectorAll("a, button, [tabindex], input, select, textarea")).toHaveLength(
      0,
    );
  });

  it("a loading map ignores region taps", () => {
    const onSelectArea = vi.fn();
    const { container } = renderInRouter(
      <BodyMap variant="full" loading onSelectArea={onSelectArea} />,
    );
    fireEvent.click(regions(mapRoot(container), "chest")[0]!);
    expect(onSelectArea).not.toHaveBeenCalled();
  });
});

describe("AC-4 compact: one link, nothing focusable inside, numbers in both variants", () => {
  it("exactly one link named 'Body map, last 14 days. Open all areas'; no region handlers", () => {
    const onSelectArea = vi.fn();
    const { container } = renderInRouter(
      <BodyMap variant="compact" areas={mixedFixture} onSelectArea={onSelectArea} />,
      "/",
    );
    const root = mapRoot(container);
    const link = within(root).getByRole("link", { name: "Body map, last 14 days. Open all areas" });
    expect(root.querySelectorAll("a, button, [tabindex]")).toHaveLength(1);
    expect(root.querySelector("a, button, [tabindex]")).toBe(link);
    expect(link.querySelector("svg")).not.toBeNull();
    // A tap on a region is just a tap on the link: it goes to /balance, never to an area.
    fireEvent.click(regions(root, "calves")[0]!);
    expect(onSelectArea).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/balance$/);
  });

  for (const variant of ["compact", "full"] as const) {
    it(`${variant}: every area shows its load / target text`, () => {
      const { container } = renderInRouter(<BodyMap variant={variant} areas={zeroFixture} />);
      for (const a of zeroFixture) {
        expect(within(areaEl(container, a.area)).getByText(`0 / ${a.target}`)).toBeVisible();
      }
    });
  }
});

describe("AC-5 label <-> region linking", () => {
  const rings = (root: HTMLElement) => root.querySelectorAll("svg .wl-fig__ring");

  it("focusing Shoulders rings both views' shoulder regions; blur removes it", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    const root = mapRoot(container);
    const shoulders = regions(root, "shoulders");
    const views = new Set(
      shoulders.map((p) => p.closest("[data-view]")?.getAttribute("data-view")),
    );
    expect(views).toEqual(new Set(["front", "back"]));
    expect(rings(root)).toHaveLength(0);
    const btn = screen.getByRole("button", { name: /^Shoulders,/ });
    fireEvent.focus(btn);
    expect(rings(root)).toHaveLength(shoulders.length);
    const ringViews = new Set(
      Array.from(rings(root)).map((r) => r.closest("[data-view]")?.getAttribute("data-view")),
    );
    expect(ringViews).toEqual(new Set(["front", "back"]));
    fireEvent.blur(btn);
    expect(rings(root)).toHaveLength(0);
  });

  it("hovering a label rings its regions too", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    const btn = screen.getByRole("button", { name: /^Calves,/ });
    fireEvent.mouseEnter(btn);
    expect(rings(mapRoot(container))).toHaveLength(2);
    fireEvent.mouseLeave(btn);
    expect(rings(mapRoot(container))).toHaveLength(0);
  });

  it("hovering a chest region gives the Chest label the hover state, and no other label", () => {
    const { container } = renderInRouter(<BodyMap variant="full" areas={mixedFixture} />);
    const root = mapRoot(container);
    fireEvent.mouseOver(regions(root, "chest")[0]!);
    const hovered = Array.from(root.querySelectorAll('[data-part="label"][data-hover="true"]'));
    expect(hovered.map((h) => h.getAttribute("data-area"))).toEqual(["chest"]);
    fireEvent.mouseLeave(root.querySelector('[data-part="figure"]')!);
    expect(root.querySelectorAll('[data-hover="true"]')).toHaveLength(0);
  });
});
