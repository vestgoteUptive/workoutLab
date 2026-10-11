// T-0556 AC-2 (spec AC-2): no colour literal in the component source, its CSS or the rendered SVG.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BodyFigure } from "../index.js";

const DIR = resolve(process.cwd(), "src/components/body-figure");
const css = readFileSync(resolve(DIR, "body-figure.css"), "utf8");
const tsx = readFileSync(resolve(DIR, "BodyFigure.tsx"), "utf8");
const NAMED =
  /\b(red|green|blue|white|black|gray|grey|yellow|orange|purple|pink|lime|transparent)\b/i;
const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;

describe("AC-2 tokens only", () => {
  it("the rendered SVG has no colour literal in fill/stroke and no style colours", () => {
    const svg = renderToStaticMarkup(
      createElement(BodyFigure, {
        regions: {
          chest: { fill: "primary" },
          back: { fill: { coverageStep: 2 }, attention: true },
        },
        highlighted: "calves",
        size: "full",
      }),
    );
    expect(svg).not.toMatch(LITERAL);
    for (const m of svg.matchAll(/\b(fill|stroke)="([^"]*)"/g)) {
      expect(m[2]).toMatch(/^(none|url\(#[\w-]+\))$/);
    }
  });

  it("the source has no colour literal", () => {
    expect(tsx).not.toMatch(LITERAL);
  });

  it("every colour in the css is a token or, inside forced-colors, a system colour", () => {
    expect(css).not.toMatch(LITERAL);
    const [normal, forced] = css.split("@media (forced-colors: active)");
    expect(forced).toBeDefined();
    const colourValues = (src: string) =>
      [...src.matchAll(/\b(?:fill|stroke):\s*([^;]+);/g)].map((m) => m[1]!.trim());
    for (const v of colourValues(normal!)) {
      // T-0615: the generic state variables (D-0211 §2) are allowed next to --wl-color-*; they
      // are the same tokens resolved per state. A raw #fff still fails LITERAL above.
      // T-0660 (D-0225): the figure variables --wl-fig-* are built from --wl-bg / --wl-ink; the
      // attention colour is the plan token in every state.
      expect(v).toMatch(
        /^(none|var\(--wl-color-plan-attention\)|var\(--wl-fig-(hatch|bg|ink|base|zone)\)|color-mix\(in srgb, var\(--wl-fig-ink\) (12|20)%, transparent\))$/,
      );
    }
    for (const v of colourValues(forced!)) {
      expect(v).toMatch(
        /^(none|Canvas|CanvasText|GrayText|Highlight|var\(--wl-fig-hatch\)|var\(--wl-color-[\w-]+\))$/,
      );
    }
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/, transparent\)/g, ")")).not.toMatch(
      NAMED,
    );
  });

  it("forced colours: primary CanvasText, none Canvas, borders CanvasText, attention 9 Highlight", () => {
    const forced = css.split("@media (forced-colors: active)")[1]!;
    expect(forced).toMatch(
      /\.wl-fig__region\.wl-fig__region--primary,[\s\S]*?\.wl-fig__region--step-4,[\s\S]*?{\s*fill:\s*CanvasText/,
    );
    expect(forced).toMatch(
      /\.wl-fig__region\[class\*="--step-"\],[\s\S]*?{\s*fill:\s*Canvas;\s*stroke:\s*CanvasText/,
    );
    expect(forced).toMatch(/\.wl-fig__halo-warn\s*{\s*stroke:\s*Highlight;\s*stroke-width:\s*9/);
    expect(forced).toMatch(/\.wl-fig__hatch-line\s*{\s*fill:\s*CanvasText/);
  });

  it("T-0660 AC8: sizes are rem and no px length is used", () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bare).not.toMatch(/\d\s*px\b/);
    expect(bare).toMatch(/\.wl-fig--full\s*{\s*width:\s*18\.5rem/);
    expect(bare).toMatch(/\.wl-fig--detail\s*{\s*width:\s*13\.5rem/);
    expect(bare).toMatch(/\.wl-fig--compact\s*{\s*width:\s*3\.75rem/);
  });
});
