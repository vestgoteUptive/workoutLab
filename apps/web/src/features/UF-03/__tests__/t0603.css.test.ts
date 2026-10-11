// @vitest-environment node
// T-0603 AC2, AC3, AC4, AC5 (D-0019, D-0211 §5): the CSS guard of the List view (lift) and the
// List view rest (drain), and the contrast of the pairs they paint, from the tokens.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "list-view.css"), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (s: string) =>
  [...strip(s).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((x) => x.trim()),
    body: m[2]!,
  }));
const all = rules(css);
const find = (selector: string) => all.find((r) => r.selectors.includes(selector));
const REST = '.wl-uf03-rest[data-wl-state="rest"]';

describe("T-0603 AC2 the Previous column", () => {
  it("is --wl-ink, and the file has no legacy Previous colour and no raw colour", () => {
    const r = find('.wl-uf03-list .wl-uf03-list__table [data-part="previous"]');
    expect(r, "the Previous rule").toBeDefined();
    expect(r!.body).not.toMatch(/color:\s*(?!var\(--wl-ink\))/);
    expect(css.toLowerCase()).not.toContain("fbd9d1");
    for (const r of all) {
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
    }
  });

  it("no cell of the table is muted: no --wl-ink-muted and no opacity in the file", () => {
    expect(css).not.toContain("--wl-ink-muted");
    expect(css).not.toMatch(/opacity:/);
  });
});

describe("T-0603 AC3 the error form", () => {
  it("a shown status has a 2 px --wl-ink border", () => {
    const r = find(".wl-uf03-list .wl-uf03-list__status:not(:empty)");
    expect(r?.body).toMatch(/border:\s*2px solid var\(--wl-ink\)/);
  });

  it("an empty status is not shown", () => {
    const r = find(".wl-uf03-list .wl-uf03-list__status:empty");
    expect(r?.body).toMatch(/display:\s*none/);
  });
});

describe("T-0603 AC4 the drain's motion", () => {
  it("the root's step is --wl-drain 1s linear", () => {
    expect(find(`${REST}.wl-drain`)?.body).toMatch(/transition:\s*--wl-drain 1s linear\s*;/);
  });

  it("under prefers-reduced-motion the transition is none", () => {
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const block = reduce.slice(0, reduce.indexOf("\n}\n") + 3);
    expect(block).toMatch(
      /\.wl-uf03-rest\[data-wl-state="rest"\]\.wl-drain\s*\{\s*transition:\s*none;/,
    );
  });

  it("the reset mark makes the jump instant", () => {
    const r = all.find((x) => x.selectors[0]!.includes('[data-drain-reset="true"]'));
    expect(r?.body).toMatch(/transition:\s*none/);
  });
});

describe("T-0603 AC5 type, targets and scope", () => {
  it("no px font size", () => {
    for (const r of all) expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
  });

  it("every selector is scoped under the List view or the rest view", () => {
    expect(all.length).toBeGreaterThan(40);
    for (const r of all) {
      // `:has(> a, > b)` and `:is(a, b)` hold commas: only the parts that start a selector count.
      for (const sel of r.selectors.filter(
        (x) => !/^>|^tbody\)|^\.wl-uf03-rest\[data-wl-state\]\)/.test(x),
      )) {
        expect(sel, sel).toMatch(/^(\.wl-uf03-list|\.wl-uf03-rest|\.wl-uf09--overlay:has\()/);
      }
    }
  });

  it("the Done box is 2.75 rem (44 px) square", () => {
    const r = find(".wl-uf03-list .wl-uf03-list__done");
    expect(r?.body).toMatch(/inline-size:\s*2\.75rem/);
    expect(r?.body).toMatch(/block-size:\s*2\.75rem/);
  });

  it("the set grid has the five columns of the canvas: Set, Previous, kg, Reps, Done", () => {
    const r = all.find((x) =>
      /grid-template-columns:\s*2\.25rem minmax\(0, 1fr\) 4rem/.test(x.body),
    );
    expect(r?.body).toMatch(/display:\s*grid/);
    expect(r?.body).toMatch(
      /grid-template-columns:\s*2\.25rem minmax\(0, 1fr\) 4rem 3\.5rem 2\.75rem/,
    );
  });

  it("the Skip text on the fill is lift.on-action", () => {
    expect(find(`${REST} .wl-button--session`)?.body).toMatch(
      /--wl-on-action:\s*var\(--wl-color-lift-on-action\)/,
    );
  });

  it("the legacy Chalk & Iron classes are gone from this file", () => {
    expect(css).not.toMatch(/__button|__primary|--wl-color-text|--wl-color-accent|--wl-color-bg/);
  });
});

describe("T-0603 AC5 contrast, from the tokens", () => {
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

  it("Previous, text and borders: white on lift.bg is 4.8 or more (Previous was 3.3)", () => {
    expect(ratio(lift.ink!, lift.bg!)).toBeGreaterThanOrEqual(4.8);
    expect(ratio("#".concat("FBD9D1"), lift.bg!)).toBeLessThan(4.5);
  });

  it("the Done tick, lift.on-action on its white fill, is 6.1 or more", () => {
    expect(ratio(lift["on-action"]!, lift.action!)).toBeGreaterThanOrEqual(6.1);
  });

  it("the rest view: white on rest.bg is 4.9 or more, Skip's lift.on-action on white 6.1", () => {
    expect(ratio(rest.ink!, rest.bg!)).toBeGreaterThanOrEqual(4.9);
    expect(ratio(lift["on-action"]!, rest.action!)).toBeGreaterThanOrEqual(6.1);
  });
});
