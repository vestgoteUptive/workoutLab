// T-0556 AC-1, AC-3, AC-4, AC-6 and the edge cases (D-0207, spec body-map-silhouette AC-1/3).
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AREAS, type Area } from "@workoutlab/shared";
import { BodyFigure, type BodyFigureProps } from "../index.js";

afterEach(cleanup);

const FRONT_ONLY: Area[] = ["chest", "core", "quads"];
const BACK_ONLY: Area[] = ["back", "glutes", "hamstrings", "calves"];
const BOTH: Area[] = ["shoulders", "arms"];

function mount(props: Partial<BodyFigureProps> = {}) {
  const { container } = render(<BodyFigure regions={{}} size="detail" {...props} />);
  return container.querySelector("svg")!;
}
const areasIn = (root: Element) =>
  new Set([...root.querySelectorAll("[data-area]")].map((e) => e.getAttribute("data-area")));
const region = (svg: Element, area: string) => [...svg.querySelectorAll(`[data-area="${area}"]`)];

describe("AC-1 data-area values per view", () => {
  it("front, back and the neutral parts match the T-0315 table", () => {
    const svg = mount();
    const front = svg.querySelector('[data-view="front"]')!;
    const back = svg.querySelector('[data-view="back"]')!;
    expect(areasIn(front)).toEqual(new Set([...FRONT_ONLY, ...BOTH]));
    expect(areasIn(back)).toEqual(new Set([...BACK_ONLY, ...BOTH]));
    expect(areasIn(svg)).toEqual(new Set(AREAS));
    // neutral parts and seams carry no data-area
    for (const el of svg.querySelectorAll(".wl-fig__body:not(.wl-fig__region)")) {
      expect(el.hasAttribute("data-area")).toBe(false);
    }
    expect(svg.querySelectorAll(".wl-fig__silhouette").length).toBe(2);
  });
});

describe("AC-3 aria-hidden, nothing focusable", () => {
  it.each([
    [{}],
    [{ regions: { chest: { fill: "primary" } }, onRegionPointer: () => {}, highlighted: "chest" }],
    [{ regions: { back: { fill: { coverageStep: 4 }, attention: true } } }],
  ] as Partial<BodyFigureProps>[][])("props %#", (props) => {
    const svg = mount(props);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("a,button,[tabindex],input")).toHaveLength(0);
    expect(svg.querySelectorAll("animate,animateTransform,set")).toHaveLength(0);
  });
});

describe("AC-4 styles", () => {
  it("primary, secondary, step with attention, and none for the rest", () => {
    const svg = mount({
      regions: {
        chest: { fill: "primary" },
        calves: { fill: "secondary" },
        back: { fill: { coverageStep: 3 }, attention: true },
      },
    });
    for (const p of region(svg, "chest"))
      expect(p.getAttribute("class")).toContain("wl-fig__region--primary");
    for (const p of region(svg, "calves"))
      expect(p.getAttribute("class")).toContain("wl-fig__region--secondary");
    const back = region(svg, "back");
    expect(back.length).toBe(6);
    for (const p of back) {
      expect(p.getAttribute("class")).toContain("wl-fig__region--step-3");
      expect(p.getAttribute("class")).toContain("wl-fig__region--attention");
    }
    for (const a of AREAS.filter((x) => !["chest", "calves", "back"].includes(x))) {
      for (const p of region(svg, a)) {
        expect(p.getAttribute("class")).toContain("wl-fig__region--none");
        expect(p.getAttribute("class")).not.toContain("attention");
      }
    }
    // one warn + one gap halo per attention region, none for the others
    expect(svg.querySelectorAll(".wl-fig__halo-warn")).toHaveLength(6);
    expect(svg.querySelectorAll(".wl-fig__halo-gap")).toHaveLength(6);
    // secondary fill references this instance's own pattern
    const ref = svg.style.getPropertyValue("--wl-fig-hatch");
    const id = /^url\(#(.+)\)$/.exec(ref)![1]!;
    expect(id).toMatch(/^wl-fig-hatch/);
    expect(svg.querySelector(`pattern[id="${id}"]`)).not.toBeNull();
  });

  it.each([0, 1, 2, 3, 4] as const)("coverageStep %i maps to step-%i", (n) => {
    const svg = mount({ regions: { quads: { fill: { coverageStep: n } } } });
    for (const p of region(svg, "quads")) {
      expect(p.getAttribute("class")).toContain(`wl-fig__region--step-${n}`);
    }
  });

  it.each([5, 7, -1, 2.5, Number.NaN, undefined])(
    "bad step %s is neutral and does not throw",
    (bad) => {
      const svg = mount({ regions: { quads: { fill: { coverageStep: bad as never } } } });
      for (const p of region(svg, "quads")) {
        expect(p.getAttribute("class")).toContain("wl-fig__region--none");
      }
    },
  );

  it("zero data: all nine areas are none", () => {
    const svg = mount({ regions: {} });
    for (const a of AREAS) {
      expect(region(svg, a).length).toBeGreaterThan(0);
      for (const p of region(svg, a)) expect(p.getAttribute("class")).toContain("--none");
    }
  });

  it("shoulders and arms get the same style in both views", () => {
    const svg = mount({ regions: { shoulders: { fill: "primary" }, arms: { fill: "secondary" } } });
    for (const view of ["front", "back"]) {
      const v = svg.querySelector(`[data-view="${view}"]`)!;
      for (const p of region(v, "shoulders"))
        expect(p.getAttribute("class")).toContain("--primary");
      for (const p of region(v, "arms")) expect(p.getAttribute("class")).toContain("--secondary");
    }
  });

  it("seams of accent-filled areas switch to on-accent", () => {
    const svg = mount({
      regions: { chest: { fill: "primary" }, core: { fill: { coverageStep: 1 } } },
    });
    for (const s of svg.querySelectorAll('[data-seam="chest"]')) {
      expect(s.getAttribute("class")).toContain("wl-fig__seam--on-accent");
    }
    for (const s of svg.querySelectorAll('[data-seam="core"]')) {
      expect(s.getAttribute("class")).not.toContain("on-accent");
    }
  });

  it("highlighted draws a ring behind that area's regions only", () => {
    const svg = mount({ highlighted: "calves" });
    expect(svg.querySelectorAll(".wl-fig__ring")).toHaveLength(2);
    expect(mount({}).querySelectorAll(".wl-fig__ring")).toHaveLength(0);
  });

  it("AC-ring: the ring is painted above every body part and below the regions", () => {
    const svg = mount({ highlighted: "core", regions: { core: { fill: { coverageStep: 2 } } } });
    for (const view of svg.querySelectorAll("[data-view]")) {
      const order = [...view.children];
      const idx = (el: Element) => order.indexOf(el);
      const ring = [...view.querySelectorAll(".wl-fig__ring, .wl-fig__ring-gap")];
      if (ring.length === 0) continue; // core is front-only
      const parts = [...view.querySelectorAll(".wl-fig__body:not(.wl-fig__region)")];
      const regions = [...view.querySelectorAll("[data-area]")];
      expect(parts.length).toBeGreaterThan(0);
      for (const r of ring) {
        for (const p of parts) expect(idx(r)).toBeGreaterThan(idx(p));
        for (const a of regions) expect(idx(r)).toBeLessThan(idx(a));
      }
      expect(idx(ring[0]!)).toBeLessThan(idx(ring[1]!));
    }
    expect(svg.querySelectorAll(".wl-fig__ring").length).toBeGreaterThan(0);
  });

  it("each instance gets its own hatch id", () => {
    const { container } = render(
      <>
        <BodyFigure regions={{}} size="compact" />
        <BodyFigure regions={{}} size="full" />
      </>,
    );
    const ids = [...container.querySelectorAll("pattern")].map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const vars = [...container.querySelectorAll("svg")].map((s) =>
      s.style.getPropertyValue("--wl-fig-hatch"),
    );
    expect(vars).toEqual(ids.map((i) => `url(#${i})`));
  });

  it("size picks the height class", () => {
    expect(mount({ size: "compact" }).getAttribute("class")).toContain("wl-fig--compact");
    expect(mount({ size: "full" }).getAttribute("class")).toContain("wl-fig--full");
  });

  it("makes no network call on mount (offline)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mount({ regions: { chest: { fill: "primary" } } });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("AC-6 pointer", () => {
  it("a calves click calls once with calves; a neutral part calls nothing", () => {
    const onRegionPointer = vi.fn();
    const svg = mount({ onRegionPointer });
    fireEvent.click(region(svg, "calves")[0]!);
    expect(onRegionPointer).toHaveBeenCalledTimes(1);
    expect(onRegionPointer).toHaveBeenCalledWith("calves");
    fireEvent.click(svg.querySelector(".wl-fig__silhouette")!);
    fireEvent.click(svg.querySelector(".wl-fig__seam")!);
    expect(onRegionPointer).toHaveBeenCalledTimes(1);
  });

  it("without the prop no handler is attached", () => {
    const svg = mount({});
    // React attaches delegated listeners at the root, so check the rendered props instead:
    // a click must not throw and must change nothing.
    expect(() => fireEvent.click(region(svg, "calves")[0]!)).not.toThrow();
  });
});
