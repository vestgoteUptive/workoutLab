// Shared body figure (T-0556, D-0207, UF-04.2 / UF-02.1 / UF-10.1). Purely presentational: it
// computes nothing (principle 3). The markup is the designer's single asset, inlined at build
// time (no fetch, so it works offline); this file only adds classes, the per-instance hatch id
// and the attention / highlight halos. Colours live in body-figure.css, by class and token.
// The whole <svg> is aria-hidden: the text equivalent is the area lists / labels beside it.
import { createElement, useId, type MouseEvent, type ReactNode } from "react";
import { AREAS, type Area } from "@workoutlab/shared";
import figureSvg from "../../../../../Design-docs/docs/design/assets/body-figure/body-figure.svg?raw";
import "./body-figure.css";

export type CoverageStep = 0 | 1 | 2 | 3 | 4;

export interface RegionStyle {
  fill: "none" | "primary" | "secondary" | { coverageStep: CoverageStep };
  attention?: boolean;
}

export interface BodyFigureProps {
  regions: Partial<Record<Area, RegionStyle>>;
  highlighted?: Area;
  onRegionPointer?: (area: Area) => void;
  size: "compact" | "detail" | "full";
}

interface Node_ {
  tag: string;
  attrs: Record<string, string>;
  children: Node_[];
}

const HATCH_ID = "wl-fig-hatch";

let parsed: Node_ | undefined;
function toTree(el: Element): Node_ {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  return { tag: el.tagName, attrs, children: Array.from(el.children).map(toTree) };
}
function tree(): Node_ {
  parsed ??= toTree(new DOMParser().parseFromString(figureSvg, "image/svg+xml").documentElement);
  return parsed;
}

/** The modifier for a style; a missing, non-integer or out-of-range step is neutral. */
function modifier(style: RegionStyle | undefined): string {
  const fill = style?.fill;
  if (fill === "primary" || fill === "secondary") return fill;
  if (typeof fill === "object" && fill !== null) {
    const s = fill.coverageStep as number;
    if (Number.isInteger(s) && s >= 0 && s <= 4) return `step-${s}`;
  }
  return "none";
}

const isArea = (v: string | undefined): v is Area => (AREAS as readonly string[]).includes(v ?? "");
const onAccent = (m: string) => m === "primary" || m === "step-3" || m === "step-4";

export function BodyFigure({ regions, highlighted, onRegionPointer, size }: BodyFigureProps) {
  const hatchId = `${HATCH_ID}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const root = tree();

  const mods = new Map<string, string>();
  for (const a of AREAS) mods.set(a, modifier(regions[a]));

  function build(n: Node_, key: number): ReactNode {
    const props: Record<string, unknown> = { key };
    for (const [k, v] of Object.entries(n.attrs)) props[k === "class" ? "className" : k] = v;
    if (n.tag === "pattern" && n.attrs.id === HATCH_ID) props.id = hatchId;
    return createElement(n.tag, props, ...n.children.map(build));
  }

  function path(n: Node_, className: string, key: string, withArea?: string): ReactNode {
    const props: Record<string, unknown> = { key, d: n.attrs.d, className };
    if (withArea) props["data-area"] = withArea;
    return createElement("path", props);
  }

  function view(v: Node_, vi: number): ReactNode {
    const out: ReactNode[] = [];
    const parts: ReactNode[] = [];
    const late: ReactNode[] = [];
    const seams: ReactNode[] = [];
    const rings: ReactNode[] = [];
    v.children.forEach((c, i) => {
      const cls = c.attrs.class ?? "";
      const area = c.attrs["data-area"];
      const seamArea = c.attrs["data-seam"];
      if (seamArea !== undefined) {
        const m = mods.get(seamArea) ?? "none";
        seams.push(path(c, cls + (onAccent(m) ? " wl-fig__seam--on-accent" : ""), `s${i}`));
        return;
      }
      if (!area || !isArea(area)) {
        parts.push(path(c, cls, `b${i}`));
        return;
      }
      const m = mods.get(area)!;
      const attention = regions[area]?.attention === true;
      const region = path(
        c,
        `${cls} wl-fig__region--${m}${attention ? " wl-fig__region--attention" : ""}`,
        `r${i}`,
        area,
      );
      if (highlighted === area) {
        rings.push(path(c, "wl-fig__ring", `rg${i}`), path(c, "wl-fig__ring-gap", `rgg${i}`));
      }
      if (attention) {
        late.push(
          path(c, "wl-fig__halo-warn", `hw${i}`),
          path(c, "wl-fig__halo-gap", `hg${i}`),
          region,
        );
      } else out.push(region);
    });
    return createElement(
      "g",
      { key: vi, className: v.attrs.class, "data-view": v.attrs["data-view"] },
      // Paint order (AC-ring): body parts, then the highlight ring, then the regions, so the
      // silhouette never hides the ring and the ring's gap never eats into its own region.
      ...parts,
      ...rings,
      ...out,
      ...late,
      ...seams,
    );
  }

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    const hit = (e.target as Element).closest?.("[data-area]");
    const area = hit?.getAttribute("data-area") ?? undefined;
    if (isArea(area)) onRegionPointer?.(area);
  }

  const children = root.children.map((c, i) => (c.tag === "g" ? view(c, i) : build(c, i)));
  return createElement(
    "svg",
    {
      xmlns: root.attrs.xmlns,
      viewBox: root.attrs.viewBox,
      className: `wl-fig wl-fig--${size}`,
      "aria-hidden": "true",
      focusable: "false",
      style: { "--wl-fig-hatch": `url(#${hatchId})` },
      ...(onRegionPointer ? { onClick: handleClick } : {}),
    },
    ...children,
  );
}
