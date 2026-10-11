// @vitest-environment node
// T-0596 AC5, AC6 (D-0019, D-0211 §5): the CSS guard for the deep fill on UF-09.2 and UF-09.7.
// The fill's step is 1 s linear and instant under reduced motion; the section has no px font size
// and no raw colour; every rule is scoped under the lift state; the ring rules are gone (T-0597).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "uf-09.css"), "utf8");
const drainCss = readFileSync(resolve(__dirname, "../../../components/drain/drain.css"), "utf8");
const START = "/* ---- T-0596";
const END = "/* ---- end T-0596 ---- */";
const section = css.slice(css.indexOf(START), css.indexOf(END));

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (s: string) =>
  [...strip(s).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((x) => x.trim()),
    body: m[2]!,
  }));

describe("T-0596 AC5 motion", () => {
  it("the root's step is --wl-drain 1s linear", () => {
    const r = rules(section).find((x) =>
      x.selectors.includes('.wl-uf09[data-wl-state="lift"].wl-drain'),
    );
    expect(r?.body).toMatch(/transition:\s*--wl-drain 1s linear\s*;/);
  });

  it("under prefers-reduced-motion the transition is none (a jump each second)", () => {
    const reduce = section.slice(section.indexOf("@media (prefers-reduced-motion: reduce)"));
    const block = reduce.slice(0, reduce.indexOf("\n}\n") + 3);
    expect(block).toMatch(/\.wl-uf09\[data-wl-state="lift"\]\.wl-drain\s*\{\s*transition:\s*none;/);
    expect(drainCss).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.wl-drain\s*\{\s*transition:\s*none;/,
    );
  });

  it("the reset mark makes the jump instant", () => {
    const r = rules(section).find((x) => x.selectors[0]!.includes('[data-drain-reset="true"]'));
    expect(r?.body).toMatch(/transition:\s*none/);
  });
});

describe("T-0596 AC6 the changed CSS", () => {
  it("the section exists and every selector is scoped under the lift root", () => {
    expect(rules(section).length).toBeGreaterThan(8);
    for (const r of rules(section)) {
      for (const sel of r.selectors) expect(sel, sel).toMatch(/^\.wl-uf09\[data-wl-state="lift"\]/);
    }
  });

  it("no px font size and no raw colour", () => {
    for (const r of rules(section)) {
      expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
    }
  });

  it("the lift root keeps its colour as background-color, under the drain's gradient", () => {
    const r = rules(css).find((x) => x.selectors.includes('.wl-uf09[data-wl-state="lift"]'));
    expect(r?.body).toMatch(/background-color:\s*var\(--wl-bg\)/);
  });

  it("the ring rules are gone: UF-09.5 (T-0597) was the last view that drew a ring", () => {
    expect(css).not.toContain(".wl-uf09__ring");
    expect(css).not.toContain("data-warn");
  });
});
