// @vitest-environment node
// T-0595 AC8, AC9 (D-0019, D-0211): the CSS guard for UF-09.3 and UF-09.4. Colours come from the
// --wl-* variables only, sizes are rem, every lift rule out-ranks the legacy .wl-uf09 rules by
// selector (not by load order), and nothing but main.css's state cross-fade moves.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "uf-09.css"), "utf8");
const START = "/* ---- T-0595";
const END = "/* ---- end T-0595 ---- */";
const section = css.slice(css.indexOf(START), css.indexOf(END));

interface Rule {
  selectors: string[];
  body: string;
}

function rulesOf(source: string): Rule[] {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((s) => s.trim()),
    body: m[2]!,
  }));
}

/** Selectors that exist only on UF-09.3 / UF-09.4 (and the chrome there): their legacy rules go. */
const LIFT_ONLY = [
  ".wl-uf09__done",
  ".wl-uf09__stepper",
  ".wl-uf09__value",
  ".wl-uf09__input",
  ".wl-uf09__rir",
  ".wl-uf09__label",
  ".wl-uf09__autosave",
  ".wl-uf09__save",
  ".wl-uf09__field",
  ".wl-uf09__pause",
  ".wl-uf09__progress",
  ".wl-uf09__segment",
  ".wl-uf09__index",
];

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

describe("T-0595 AC8 uf-09.css for the lift views", () => {
  it("the section exists and has rules", () => {
    expect(section.length).toBeGreaterThan(500);
    expect(rulesOf(section).length).toBeGreaterThan(15);
  });

  it("the section has no px font size and no raw colour", () => {
    for (const rule of rulesOf(section)) {
      expect(rule.body, rule.selectors.join(", ")).not.toMatch(/font-size:[^;]*\d+px/);
      expect(rule.body, rule.selectors.join(", ")).not.toMatch(RAW_COLOUR);
    }
  });

  it("the lift-only selectors have no px font size and no raw colour anywhere in the file", () => {
    for (const rule of rulesOf(css)) {
      if (!rule.selectors.some((s) => LIFT_ONLY.some((c) => s.includes(c)))) continue;
      expect(rule.body, rule.selectors.join(", ")).not.toMatch(/font-size:[^;]*\d+px/);
      expect(rule.body, rule.selectors.join(", ")).not.toMatch(RAW_COLOUR);
    }
  });

  it("the legacy rules for the lift-only classes are gone (the new section is their only home)", () => {
    const legacy = css.slice(0, css.indexOf(START));
    for (const rule of rulesOf(legacy)) {
      for (const s of rule.selectors) {
        expect(
          LIFT_ONLY.some((c) => s.startsWith(c)),
          s,
        ).toBe(false);
      }
    }
  });

  it("no 200 px Done and no legacy bg-focus", () => {
    expect(css).not.toMatch(/min-height:\s*200px/);
    expect(css).not.toMatch(/bg-focus/);
  });
});

describe("T-0595 load order: every lift rule is scoped under the state attribute", () => {
  it('each selector starts at .wl-uf09[data-wl-state="lift"] (specificity 0,2,0 or more)', () => {
    for (const rule of rulesOf(section)) {
      for (const s of rule.selectors) {
        expect(s.startsWith('.wl-uf09[data-wl-state="lift"]'), s).toBe(true);
      }
    }
  });

  it("the lift root paints --wl-bg itself, so the legacy .wl-uf09 background cannot win", () => {
    const root = rulesOf(section).find((r) =>
      r.selectors.includes('.wl-uf09[data-wl-state="lift"]'),
    );
    expect(root?.body).toMatch(/background:\s*var\(--wl-bg\)/);
    expect(root?.body).toMatch(/color:\s*var\(--wl-ink\)/);
  });
});

describe("T-0595 AC9 motion", () => {
  it("the section declares no transition and no animation (main.css owns the 200 ms cross-fade)", () => {
    expect(section).not.toMatch(/\btransition\s*:|\banimation\s*:|\btransition-|\banimation-/);
  });

  it("main.css gives the state root 200 ms ease-out on background-color, and none under reduce", () => {
    const main = readFileSync(resolve(__dirname, "../../../main.css"), "utf8");
    expect(main).toMatch(
      /\[data-wl-state\],\s*:root\s*\{\s*transition:\s*background-color 200ms ease-out;/,
    );
    expect(main).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\[data-wl-state\],\s*:root\s*\{\s*transition: none;/,
    );
  });
});
