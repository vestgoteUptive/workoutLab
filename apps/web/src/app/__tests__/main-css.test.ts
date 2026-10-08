// @vitest-environment node
// T-0546 AC1/AC2 (visual-foundation T-4): main.css read as text. The path can be overridden so
// the planted-fault run (AC2) points the same assertions at a backup copy with a px font size.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS_PATH = process.env.WL_MAIN_CSS ?? resolve(process.cwd(), "src/main.css");
const css = readFileSync(CSS_PATH, "utf8");
const CHECK_COLOURS = resolve(
  process.cwd(),
  "../../packages/design-tokens/bin/wl-check-colours.js",
);

/** Declarations of every rule whose selector list contains `selector` (exactly, comma-split). */
function declarations(selector: string): string {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1]!
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((s) => s.trim());
    if (selectors.includes(selector)) out.push(m[2]!);
  }
  expect(out, `no rule for ${selector}`).not.toHaveLength(0);
  return out.join("\n");
}

describe("T-0546 AC1 main.css (visual foundation T-4)", () => {
  it("h1 and h2 use the display font, body uses the body font", () => {
    expect(declarations("h1")).toContain("font-family: var(--wl-font-display)");
    expect(declarations("h2")).toContain("font-family: var(--wl-font-display)");
    expect(declarations("body")).toContain("font-family: var(--wl-font-body)");
  });

  it("h1 and h2 follow the scale: 800, uppercase, rem sizes, margin 0", () => {
    const h1 = declarations("h1");
    expect(h1).toMatch(/font-size:\s*clamp\(2rem, 10vw, 2\.5rem\)/);
    expect(h1).toMatch(/overflow-wrap:\s*anywhere/);
    expect(declarations("h2")).toMatch(/font-size:\s*1\.5rem/);
    for (const sel of ["h1", "h2"]) {
      const d = declarations(sel);
      expect(d).toMatch(/font-weight:\s*800/);
      expect(d).toMatch(/text-transform:\s*uppercase/);
      expect(d).toMatch(/letter-spacing:\s*0\.01em/);
      expect(d).toMatch(/margin:\s*0\b/);
    }
  });

  it("no font-size uses px; every one is rem or a clamp of rem/vw", () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
    expect(sizes.length).toBeGreaterThan(5);
    for (const v of sizes) {
      expect(v, `font-size: ${v}`).not.toMatch(/px/);
      expect(v, `font-size: ${v}`).toMatch(/^(\d*\.?\d+rem|clamp\([\d.rem ,vw]+\))$/);
    }
  });

  it("has no raw colour (the check-colours guard passes on the file)", () => {
    const dir = mkdtempSync(join(tmpdir(), "wl-css-"));
    writeFileSync(join(dir, "main.css"), css);
    const r = spawnSync("node", [CHECK_COLOURS, dir], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it(".wl-page has the max width, centring and two safe-area paddings", () => {
    const d = declarations(".wl-page");
    expect(d).toMatch(/max-inline-size:\s*640px/);
    expect(d).toMatch(/margin-inline:\s*auto/);
    expect(d).toMatch(
      /padding-inline:\s*max\(20px, env\(safe-area-inset-left\)\)\s+max\(20px, env\(safe-area-inset-right\)\)/,
    );
  });

  it(".wl-input has a 1px text-muted border", () => {
    expect(declarations(".wl-input")).toMatch(/border:\s*1px solid var\(--wl-color-text-muted\)/);
  });

  it(".wl-button--primary is accent on on-accent", () => {
    const d = declarations(".wl-button--primary");
    expect(d).toContain("background: var(--wl-color-accent)");
    expect(d).toContain("color: var(--wl-color-on-accent)");
  });

  it("the shared classes exist with their spec sizes", () => {
    expect(declarations(".wl-card")).toMatch(/border-radius:\s*16px/);
    expect(declarations(".wl-row")).toMatch(/min-block-size:\s*56px/);
    expect(declarations(".wl-button--secondary")).toMatch(/min-block-size:\s*48px/);
    expect(declarations(".wl-button--text")).toMatch(/min-block-size:\s*44px/);
    expect(declarations(".wl-label")).toMatch(/font-size:\s*0\.75rem/);
    expect(declarations(".wl-stat--hero")).toMatch(/font-size:\s*2\.125rem/);
    expect(declarations(".wl-muted")).toMatch(/font-size:\s*0\.875rem/);
    expect(declarations(".wl-caption")).toMatch(/font-size:\s*0\.8125rem/);
    expect(declarations(".wl-button--primary:focus-visible")).toMatch(
      /outline:\s*2px solid var\(--wl-color-accent\)/,
    );
  });
});
