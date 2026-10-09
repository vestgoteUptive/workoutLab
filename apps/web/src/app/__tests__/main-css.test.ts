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

  // T-0589 (logged): the uppercase pin below is scoped to the global element rules. Under a
  // [data-wl-state] root the state defaults take over (checked in visual-foundation.spec.ts).
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
    // T-0589 (D-0211 §3): the gutter is --wl-gutter (20 px on :root, so unmigrated screens are
    // unchanged); the safe-area max() stays on both sides.
    expect(d).toMatch(
      /padding-inline:\s*max\(var\(--wl-gutter\), env\(safe-area-inset-left\)\)\s+max\(var\(--wl-gutter\), env\(safe-area-inset-right\)\)/,
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

// T-0589 AC1: :root keeps the Chalk & Iron value of every D-0211 §2 generic variable.
describe("T-0589 AC1 :root fallback (D-0211 §2)", () => {
  const LEGACY: Record<string, string> = {
    "--wl-bg": "var(--wl-color-bg)",
    "--wl-raise": "var(--wl-color-surface-2)",
    "--wl-ink": "var(--wl-color-text)",
    "--wl-ink-muted": "var(--wl-color-text-muted)",
    "--wl-ink-on-raise": "var(--wl-color-text-muted)",
    "--wl-line": "var(--wl-color-line)",
    "--wl-action": "var(--wl-color-accent)",
    "--wl-on-action": "var(--wl-color-on-accent)",
    "--wl-selected": "var(--wl-color-accent)",
    "--wl-on-selected": "var(--wl-color-on-accent)",
    "--wl-attention": "var(--wl-color-warn)",
    "--wl-progress-off": "var(--wl-color-line-strong)",
    "--wl-focus": "var(--wl-color-accent)",
    "--wl-scrim": "var(--wl-color-bg)",
    "--wl-coverage-0": "var(--wl-color-coverage-0)",
    "--wl-coverage-1": "var(--wl-color-coverage-1)",
    "--wl-coverage-2": "var(--wl-color-coverage-2)",
    "--wl-coverage-3": "var(--wl-color-coverage-3)",
    "--wl-coverage-4": "var(--wl-color-coverage-4)",
    "--wl-font": "var(--wl-font-body)",
    "--wl-gutter": "20px",
  };

  it("maps each generic variable on :root to its legacy value", () => {
    const root = [...css.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)].map((m) => m[1]!).join("\n");
    for (const [name, value] of Object.entries(LEGACY)) {
      expect(root, name).toContain(`${name}: ${value};`);
    }
  });

  it("every state block sets the variables its mapping names, with no raw colour", () => {
    for (const sel of [
      '[data-wl-state="plan"]',
      '[data-wl-state="lift"]',
      '[data-wl-state="rest"]',
      ".wl-paper",
    ]) {
      const d = declarations(sel);
      for (const v of [
        "--wl-bg",
        "--wl-ink",
        "--wl-line",
        "--wl-action",
        "--wl-on-action",
        "--wl-focus",
      ]) {
        expect(d, `${sel} ${v}`).toContain(`${v}:`);
      }
    }
    expect(declarations('[data-wl-state="plan"]')).toContain("--wl-font: var(--wl-font-plan)");
    expect(declarations('[data-wl-state="lift"]')).toContain("--wl-font: var(--wl-font-session)");
  });
});

describe("T-0589 AC9 type is rem", () => {
  it("has the state type scale and every font-size is rem or clamp of rem/vw", () => {
    for (const cls of [".wl-type-hero", ".wl-type-hero-number", ".wl-type-countdown"]) {
      expect(css).toContain(cls);
    }
    expect(declarations("[data-wl-state] .wl-type-hero")).toContain("clamp(6rem, 26vw, 7rem)");
    const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1]!.trim());
    expect(sizes.length).toBeGreaterThan(20);
    for (const v of sizes) expect(v).toMatch(/^(\d*\.?\d+rem|clamp\([\d.rem ,vw]+\))$/);
  });
});
