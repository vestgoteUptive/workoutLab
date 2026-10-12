// @vitest-environment node
// T-0610 AC2 to AC5: the CSS guard of the editor in the plan state, and the contrast of the pairs
// it paints, from the tokens.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const css = read("../routine-editor.css");
const main = read("../../../main.css");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = (s: string) =>
  [...strip(s).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((x) => x.trim()),
    body: m[2]!,
  }));
const all = rules(css);
const find = (selector: string) => all.find((r) => r.selectors.includes(selector));

describe("T-0610 AC2 invalid input and error text", () => {
  it("the shared plan input is 1px ink-muted valid and 2px attention invalid", () => {
    expect(main).toMatch(/\.wl-input \{[^}]*border:\s*1px solid var\(--wl-ink-muted\)/);
    expect(main).toMatch(
      /\.wl-input\[aria-invalid="true"\] \{[^}]*border:\s*2px solid var\(--wl-attention\)/,
    );
  });
  it("the error text, and the legacy warn hint, are --wl-attention", () => {
    expect(main).toMatch(/\.wl-input__error \{[^}]*color:\s*var\(--wl-attention\)/);
    const r = find('.wl-routine-editor .wl-routine-editor__error[data-tone="error"]');
    expect(r?.body).toMatch(/color:\s*var\(--wl-attention\)/);
  });
});

describe("T-0610 AC3 danger", () => {
  it("the secondary is the 1.5px ink outline, and no warn colour is left in the file", () => {
    expect(main).toMatch(
      /\.wl-button--secondary[^{]*\{[^}]*border:\s*1\.5px solid var\(--wl-ink\)/,
    );
    expect(css).not.toMatch(/warn|data-variant/);
  });
});

describe("T-0610 AC4 selected row", () => {
  it("the row holding focus is --wl-raise with --wl-ink, never ink-muted", () => {
    const r = find(".wl-routine-editor .wl-routine-editor__row:focus-within");
    expect(r?.body).toMatch(/background:\s*var\(--wl-raise\)/);
    expect(r?.body).toMatch(/color:\s*var\(--wl-ink\)/);
    expect(r?.body).not.toMatch(/ink-muted/);
  });
});

describe("T-0610 AC5 targets, type, motion, scope", () => {
  it("icon buttons are 44 x 44", () => {
    const r = find(".wl-routine-editor .wl-routine-editor__icon");
    expect(r?.body).toMatch(/min-inline-size:\s*44px/);
    expect(r?.body).toMatch(/min-block-size:\s*44px/);
  });
  it("the shared input is at least 44 tall", () => {
    expect(main).toMatch(/\.wl-input \{[^}]*min-block-size:\s*48px/);
  });
  it("no px font size, no raw colour, no legacy variable, no display:none, no motion", () => {
    for (const r of all) {
      expect(r.body).not.toMatch(/font-size:[^;]*\d+px/);
      expect(r.body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
      expect(r.body).not.toMatch(/display:\s*none/);
    }
    expect(css).not.toMatch(/--wl-color-(text|accent|bg|surface|line|warn)\b/);
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
  it("every selector is scoped under .wl-routine-editor", () => {
    expect(all.length).toBeGreaterThan(10);
    for (const r of all) for (const s of r.selectors) expect(s, s).toMatch(/^\.wl-routine-editor/);
  });
});

describe("T-0610 AC5 contrast, from the tokens", () => {
  const tokens = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../../../../../packages/design-tokens/src/tokens.json"),
      "utf8",
    ),
  ) as { color: { plan: Record<string, string> } };
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
  const { plan } = tokens.color;
  it("attention on bg 5.0; ink on raise 6.2; ink-muted on bg 5.9; on-action on action 8.6", () => {
    expect(ratio(plan.attention!, plan.bg!)).toBeGreaterThanOrEqual(5.0);
    expect(ratio(plan.ink!, plan.raise!)).toBeGreaterThanOrEqual(6.2);
    expect(ratio(plan["ink-muted"]!, plan.bg!)).toBeGreaterThanOrEqual(5.9);
    expect(ratio(plan["on-action"]!, plan.action!)).toBeGreaterThanOrEqual(8.6);
  });
});
