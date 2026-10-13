// @vitest-environment node
// T-0604 AC2, AC3, AC4, AC5 (D-0019, D-0211 §4 §5): the CSS guard of the Summary in the plan
// state, and the contrast of the pairs it paints, from the tokens.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const css = read("../summary.css");
const main = read("../../../main.css");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (s: string) =>
  [...strip(s).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((x) => x.trim()),
    body: m[2]!,
  }));
const all = rules(css);
const find = (selector: string) => all.find((r) => r.selectors.includes(selector));

describe("T-0604 AC2 the PR band", () => {
  it("bleeds past the gutters by the variable and keeps the gutter as inline padding", () => {
    const r = find(".wl-uf03-summary .wl-uf03-summary__pr");
    expect(r?.body).toMatch(/margin-inline:\s*calc\(-1 \* var\(--wl-uf03-gutter\)\)/);
    expect(r?.body).toMatch(/padding:\s*1\.25rem var\(--wl-uf03-gutter\)/);
    expect(r?.body).toMatch(/color:\s*var\(--wl-ink\)/);
  });

  it("the gutter is read at the plan root, not in the nested lift state (26 px there)", () => {
    expect(find(".wl-uf03-summary[data-wl-state]")?.body).toMatch(
      /--wl-uf03-gutter:\s*var\(--wl-gutter\)/,
    );
  });

  it("the band's colour is the lift state's: main.css maps --wl-bg from lift.bg", () => {
    expect(main).toMatch(/\[data-wl-state="lift"\]\s*\{[^}]*\}/);
    expect(main).toMatch(/--wl-bg:\s*var\(--wl-color-lift-bg\)/);
    expect(main).toMatch(/--wl-ink:\s*var\(--wl-color-lift-ink\)/);
  });
});

describe("T-0604 AC1 the title's full stop", () => {
  it("is decoration with empty alt text, as the shared .wl-title--stop", () => {
    const r = all.filter((x) => x.selectors.includes(".wl-uf03-summary > h1::after"));
    expect(r.length).toBe(2);
    expect(r.some((x) => /content:\s*"\." \/ ""/.test(x.body))).toBe(true);
  });
});

describe("T-0604 AC3/AC5 effort options and targets", () => {
  it("the radio fills its label through the shared main.css rule, with no local copy (T-0678)", () => {
    expect(
      find('.wl-uf03-summary[data-wl-state] .wl-segmented input[type="radio"]'),
    ).toBeUndefined();
    const r = {
      body: strip(main).match(/\.wl-segmented input\[type="radio"\]\s*\{([^}]*)\}/)?.[1] ?? "",
    };
    expect(r?.body).toMatch(/inset:\s*0/);
    expect(r?.body).toMatch(/inline-size:\s*100%/);
    expect(r?.body).toMatch(/block-size:\s*100%/);
  });

  it("the five options share the width and never overflow it", () => {
    expect(find(".wl-uf03-summary[data-wl-state] .wl-segmented")?.body).toMatch(
      /inline-size:\s*100%/,
    );
    const label = find(".wl-uf03-summary[data-wl-state] .wl-segmented > label");
    expect(label?.body).toMatch(/flex:\s*1 1 0/);
    expect(label?.body).toMatch(/min-inline-size:\s*0/);
  });

  it("the shared segmented label is 44 px tall and the checked one is the selected pill", () => {
    expect(main).toMatch(/\.wl-segmented > :is\(label, button\) \{[^}]*min-block-size:\s*44px/);
    expect(main).toMatch(
      /\.wl-segmented > label:has\(input:checked\),[^{]*\{[^}]*color:\s*var\(--wl-on-selected\)[^}]*background:\s*var\(--wl-selected\)/,
    );
  });
});

describe("T-0604 AC4 the error form", () => {
  it("the shared plan error text is --wl-attention, and the status is never display:none", () => {
    expect(main).toMatch(/\.wl-input__error \{[^}]*color:\s*var\(--wl-attention\)/);
    for (const r of all) expect(r.body, r.selectors.join()).not.toMatch(/display:\s*none/);
    expect(find(".wl-uf03-summary .wl-uf03-summary__save-status")?.body).toMatch(
      /min-block-size:\s*1lh/,
    );
  });
});

describe("T-0604 AC5 type, colour, motion and scope", () => {
  it("no px font size, no raw colour, no legacy Chalk & Iron variable", () => {
    for (const r of all) {
      expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
    }
    expect(css).not.toMatch(/--wl-color-(text|accent|bg|surface|line)\b/);
  });

  it("no transition or animation in this file: only the root's cross-fade moves", () => {
    expect(css).not.toMatch(/transition:|animation:|@keyframes/);
  });

  it("the cross-fade is 200 ms ease-out and none under reduced motion", () => {
    expect(main).toMatch(
      /\[data-wl-state\],\s*:root \{\s*transition:\s*background-color 200ms ease-out;/,
    );
    expect(main).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-wl-state\],\s*:root \{\s*transition:\s*none;/,
    );
  });

  it("every selector is scoped under .wl-uf03-summary", () => {
    expect(all.length).toBeGreaterThan(10);
    for (const r of all) {
      for (const sel of r.selectors) expect(sel, sel).toMatch(/^\.wl-uf03-summary/);
    }
  });
});

describe("T-0604 AC5 contrast, from the tokens", () => {
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

  it("the PR band: white on lift.bg is 4.8 or more", () => {
    expect(ratio(lift.ink!, lift.bg!)).toBeGreaterThanOrEqual(4.8);
  });

  it("the selected option: plan.on-selected on plan.selected 8.6; the page ink on plan.bg 8.6", () => {
    expect(ratio(plan["on-selected"]!, plan.selected!)).toBeGreaterThanOrEqual(8.6);
    expect(ratio(plan.ink!, plan.bg!)).toBeGreaterThanOrEqual(8.6);
  });

  it("the save error: plan.attention on plan.bg is 5.0 or more; the captions 5.9", () => {
    expect(ratio(plan.attention!, plan.bg!)).toBeGreaterThanOrEqual(5.0);
    expect(ratio(plan["ink-muted"]!, plan.bg!)).toBeGreaterThanOrEqual(5.9);
  });

  it("Save: plan.on-action on plan.action", () => {
    expect(ratio(plan["on-action"]!, plan.action!)).toBeGreaterThanOrEqual(8.6);
  });
});
