// @vitest-environment node
// T-0597 AC5, AC6, AC7 (D-0019, D-0211 §5): the CSS guard for the rest fill on UF-09.1, UF-09.5 and
// UF-09.6, and the contrast of the pairs it paints, from the tokens. The step is 1 s linear and
// instant under reduced motion; the section has no px font size and no raw colour; every rule is
// scoped under the rest root; the ring is gone.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "uf-09.css"), "utf8");
const START = "/* ---- T-0597";
const END = "/* ---- end T-0597 ---- */";
const section = css.slice(css.indexOf(START), css.indexOf(END));
const ROOT = '.wl-uf09[data-wl-state="rest"]';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (s: string) =>
  [...strip(s).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((x) => x.trim()),
    body: m[2]!,
  }));

describe("T-0597 AC6 motion", () => {
  it("the root's step is --wl-drain 1s linear", () => {
    const r = rules(section).find((x) => x.selectors.includes(`${ROOT}.wl-drain`));
    expect(r?.body).toMatch(/transition:\s*--wl-drain 1s linear\s*;/);
  });

  it("under prefers-reduced-motion the transition is none", () => {
    const reduce = section.slice(section.indexOf("@media (prefers-reduced-motion: reduce)"));
    const block = reduce.slice(0, reduce.indexOf("\n}\n") + 3);
    expect(block).toMatch(/\.wl-uf09\[data-wl-state="rest"\]\.wl-drain\s*\{\s*transition:\s*none;/);
  });

  it("the reset mark makes the jump instant", () => {
    const r = rules(section).find((x) => x.selectors[0]!.includes('[data-drain-reset="true"]'));
    expect(r?.body).toMatch(/transition:\s*none/);
  });

  it("the fill is lift.bg over rest.bg", () => {
    const r = rules(section).find((x) => x.selectors.includes(`${ROOT}.wl-drain`));
    expect(r?.body).toMatch(
      /linear-gradient\(\s*to top,\s*var\(--wl-color-lift-bg\) var\(--wl-drain, 0%\),\s*var\(--wl-color-rest-bg\) var\(--wl-drain, 0%\)\s*\)/,
    );
  });
});

describe("T-0597 AC7 the changed CSS", () => {
  it("every selector of the section is scoped under the rest root", () => {
    expect(rules(section).length).toBeGreaterThan(15);
    for (const r of rules(section)) {
      for (const sel of r.selectors) expect(sel, sel).toMatch(/^\.wl-uf09\[data-wl-state="rest"\]/);
    }
  });

  it("no px font size and no raw colour", () => {
    for (const r of rules(section)) {
      expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
    }
  });

  it("the ring, the warn state and the orange are gone", () => {
    expect(css).not.toContain(".wl-uf09__ring");
    expect(css).not.toContain("data-warn");
    expect(section).not.toContain("--wl-color-warn");
  });

  it("the Skip button's text on the fill is lift.on-action", () => {
    const r = rules(section).find((x) => x.selectors.includes(`${ROOT} .wl-button--session`));
    expect(r?.body).toMatch(/--wl-on-action:\s*var\(--wl-color-lift-on-action\)/);
  });

  it("the root keeps its colour as background-color, under the fill's gradient", () => {
    const r = rules(section).find((x) => x.selectors.includes(ROOT));
    expect(r?.body).toMatch(/background-color:\s*var\(--wl-bg\)/);
  });
});

describe("T-0597 AC5 contrast, from the tokens", () => {
  const tokens = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../../../../../packages/design-tokens/src/tokens.json"),
      "utf8",
    ),
  ) as { color: { lift: Record<string, string>; rest: Record<string, string> } };
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
  const { lift, rest } = tokens.color;

  it("white on rest.bg is 4.9 or more, white on lift.bg 4.8 or more", () => {
    expect(ratio(rest.ink!, rest.bg!)).toBeGreaterThanOrEqual(4.9);
    expect(ratio(lift.ink!, lift.bg!)).toBeGreaterThanOrEqual(4.8);
  });

  it("the Skip text, lift.on-action, on its white button is 6.1 or more", () => {
    expect(ratio(lift["on-action"]!, lift.action!)).toBeGreaterThanOrEqual(6.1);
  });

  it("the teal on-action would not do on the red end: lift.on-action is the pair used", () => {
    expect(lift["on-action"]).not.toBe(rest["on-action"]);
  });
});
