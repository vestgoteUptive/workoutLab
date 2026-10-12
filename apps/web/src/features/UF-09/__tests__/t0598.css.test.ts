// @vitest-environment node
// T-0598 AC5, AC6 (D-0019, D-0208, D-0211; UF-09.8, UF-09.9): the CSS guard for the plan state and
// the contrast of the pairs it paints, from the tokens. Every rule of the section is scoped under
// the plan root; no px font size and no raw colour; Resume is the lift colour with white text;
// the rows are at least 44 px; the only motion is main.css's 200 ms cross-fade, instant under
// reduced motion.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");
const css = read("../uf-09.css");
const mainCss = read("../../../main.css");
const START = "/* ---- T-0598";
const END = "/* ---- end T-0598 ---- */";
const section = css.slice(css.indexOf(START), css.indexOf(END));
const ROOT = '.wl-uf09[data-wl-state="plan"]';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (s: string) =>
  [...strip(s).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((x) => x.trim()),
    body: m[2]!,
  }));
const rule = (selector: string) => rules(section).find((r) => r.selectors.includes(selector));

describe("T-0598 AC6 the changed CSS", () => {
  it("the section exists and every selector is scoped under the plan root", () => {
    expect(rules(section).length).toBeGreaterThan(15);
    for (const r of rules(section)) {
      for (const sel of r.selectors) expect(sel, sel).toMatch(/^\.wl-uf09\[data-wl-state="plan"\]/);
    }
  });

  it("no px font size and no raw colour", () => {
    for (const r of rules(section)) {
      expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
    }
  });

  it("the section animates nothing; main.css has the 200 ms cross-fade and none under reduced motion", () => {
    expect(section).not.toMatch(/transition|animation/);
    expect(mainCss).toMatch(
      /\[data-wl-state\],\s*:root\s*\{\s*transition: background-color 200ms ease-out;/,
    );
    const reduce = mainCss.slice(
      mainCss.indexOf("@media (prefers-reduced-motion: reduce) {\n  [data-wl-state],"),
    );
    expect(reduce.slice(0, reduce.indexOf("\n}\n") + 3)).toMatch(/transition: none;/);
  });

  it("Resume's fill is lift.bg and its text lift.ink (white)", () => {
    const r = rule(`${ROOT} .wl-uf09__resume`);
    expect(r?.body).toMatch(/--wl-action:\s*var\(--wl-color-lift-bg\)/);
    expect(r?.body).toMatch(/--wl-on-action:\s*var\(--wl-color-lift-ink\)/);
  });

  it("the rows are at least 44 px tall (3.5rem)", () => {
    const r = rule(`${ROOT} .wl-uf09__row`);
    const min = /min-block-size:\s*([\d.]+)rem/.exec(r?.body ?? "");
    expect(Number(min?.[1]) * 16).toBeGreaterThanOrEqual(44);
  });

  it("End workout is centred and pushed last", () => {
    const r = rule(`${ROOT} .wl-uf09__end`);
    expect(r?.body).toMatch(/margin-block-start:\s*auto/);
    expect(r?.body).toMatch(/justify-content:\s*center/);
  });

  it("the root keeps its colour from the state variable", () => {
    expect(rule(ROOT)?.body).toMatch(/background-color:\s*var\(--wl-bg\)/);
  });

  it("the shared option and outline-button rules the screens rely on are still in main.css", () => {
    expect(mainCss).toContain(".wl-option:has(input:checked)");
    expect(mainCss).toMatch(
      /\.wl-button--secondary,\s*\n?:is\(\[data-wl-state\], \.wl-paper\) \.wl-button--session-outline \{[^}]*1\.5px solid var\(--wl-ink\)/,
    );
  });
});

describe("T-0598 AC3 AC5 contrast, from the tokens", () => {
  const tokens = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../../../../../packages/design-tokens/src/tokens.json"),
      "utf8",
    ),
  ) as { color: { plan: Record<string, string>; lift: Record<string, string> } };
  const lum = (hex: string) => {
    const ch = (i: number) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return Number(((hi! + 0.05) / (lo! + 0.05)).toFixed(1));
  };
  const { plan, lift } = tokens.color;

  it("plan.ink-muted on plan.bg is 5.9 or more", () => {
    expect(ratio(plan["ink-muted"]!, plan.bg!)).toBeGreaterThanOrEqual(5.9);
  });

  it("plan.on-selected on the plan.selected block is 8.6 or more", () => {
    expect(ratio(plan["on-selected"]!, plan.selected!)).toBeGreaterThanOrEqual(8.6);
  });

  it("white on lift.bg (Resume) is 4.8 or more", () => {
    expect(ratio(lift.ink!, lift.bg!)).toBeGreaterThanOrEqual(4.8);
  });

  it("ink-on-raise on raise (the Do later error strip) is 4.5 or more", () => {
    expect(ratio(plan["ink-on-raise"]!, plan.raise!)).toBeGreaterThanOrEqual(4.5);
  });
});
