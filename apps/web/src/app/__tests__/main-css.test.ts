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
    expect(declarations("h1")).toContain("font-family: var(--wl-font)");
    expect(declarations("h2")).toContain("font-family: var(--wl-font)");
    expect(declarations("body")).toContain("font-family: var(--wl-font)");
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
    expect(declarations(".wl-input")).toMatch(/border:\s*1px solid var\(--wl-ink-muted\)/);
  });

  it(".wl-button--primary is accent on on-accent", () => {
    const d = declarations(".wl-button--primary");
    expect(d).toContain("background: var(--wl-action)");
    expect(d).toContain("color: var(--wl-on-action)");
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
      /outline:\s*2px solid var\(--wl-action\)/,
    );
  });
});

// T-0589 AC1, replaced by T-0624 (logged): :root resolves every D-0211 §2 generic variable to the
// plan group, the default state (D-0210 §6). The Chalk & Iron fallback is gone.
describe("T-0624 AC3 :root is the plan group (D-0211 §2)", () => {
  const rootBlock = () => {
    const m = stripComments(css).match(
      /(?:^|\n)\s*:root,\s*\[data-wl-state="plan"\]\s*\{([^}]*)\}/,
    );
    expect(m, ":root shares the plan block").not.toBeNull();
    return m![1]!;
  };
  const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "");

  it("maps each generic variable on :root to its plan value", () => {
    const root = rootBlock();
    const PLAN: Record<string, string> = {
      "--wl-bg": "var(--wl-color-plan-bg)",
      "--wl-raise": "var(--wl-color-plan-raise)",
      "--wl-ink": "var(--wl-color-plan-ink)",
      "--wl-ink-muted": "var(--wl-color-plan-ink-muted)",
      "--wl-line": "var(--wl-color-plan-line)",
      "--wl-action": "var(--wl-color-plan-action)",
      "--wl-on-action": "var(--wl-color-plan-on-action)",
      "--wl-attention": "var(--wl-color-plan-attention)",
      "--wl-focus": "var(--wl-color-plan-ink)",
      "--wl-font": "var(--wl-font-plan)",
      "--wl-gutter": "var(--wl-space-gutter-plan)",
    };
    for (const [name, value] of Object.entries(PLAN)) {
      expect(root, name).toContain(`${name}: ${value};`);
    }
    expect(root).not.toMatch(
      /--wl-color-(bg|text|accent|surface|line|warn)\b|--wl-font-(body|display)/,
    );
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

// T-0592 AC8: the shared Cobalt controls are scoped under a state, and read only generic variables.
describe("T-0592 AC8 scoping of the shared controls (D-0210 §3)", () => {
  /** Splits a selector list on commas outside parentheses. */
  const splitTop = (list: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of list) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...stripped.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: splitTop(m[1]!.replace(/\s+/g, " ")),
    body: m[2]!,
  }));
  const NEW =
    /\.wl-(button--session|button--session-outline|option|segmented|chip|toggle|sheet|sheet__grabber|sheet-scrim|input__error|input__error-icon|paper)\b/;
  const LEGACY = /\.wl-(button--primary|button--secondary|button--text|row|card)\b/;
  const SCOPED =
    /^(:is\((?:\[data-wl-state[^\]]*\]|\.wl-paper)(?:, (?:\[data-wl-state[^\]]*\]|\.wl-paper))*\)|\[data-wl-state[^\]]*\]|\.wl-paper)(?![\w-])/;
  const unscoped = (s: string) => !SCOPED.test(s) && !s.startsWith("@");

  it("every selector of a new control class starts at a state root or .wl-paper", () => {
    const hits = rules.flatMap((r) => r.selectors).filter((s) => NEW.test(s));
    expect(hits.length).toBeGreaterThan(20);
    // T-0630: the scrim is the one exception; it is portalled to body and has no state ancestor.
    expect(hits.filter(unscoped).filter((s) => s !== ".wl-sheet-scrim")).toEqual([]);
  });

  it("the legacy button, row and card rules outside a state keep their old values", () => {
    const hits = rules.filter((r) => r.selectors.some((s) => LEGACY.test(s) && unscoped(s)));
    expect(hits.length).toBeGreaterThan(5);
    for (const r of hits) {
      const radius = [...r.body.matchAll(/border-radius:\s*([^;]+)/g)].map((m) => m[1]!.trim());
      for (const v of radius) expect(["14px", "16px"], r.selectors.join()).toContain(v);
      expect(r.body, r.selectors.join()).not.toMatch(
        /--wl-(radius|space|selected|on-selected|focus)\b/,
      );
    }
  });

  it("scoped controls carry the spec values and read only generic variables", () => {
    const body = (sel: string) =>
      rules
        .filter((r) => r.selectors.some((s) => s.includes(sel) && SCOPED.test(s)))
        .map((r) => r.body)
        .join("\n");
    expect(body(".wl-button--primary")).toMatch(/background:\s*var\(--wl-action\)/);
    expect(body(".wl-button--primary")).toMatch(/color:\s*var\(--wl-on-action\)/);
    expect(body(".wl-button--primary")).toMatch(/border-radius:\s*var\(--wl-radius-pill\)/);
    expect(body(".wl-button--primary")).toMatch(/padding:\s*20px 28px/);
    expect(body(".wl-button--secondary")).toMatch(/border:\s*1\.5px solid var\(--wl-ink\)/);
    expect(body(".wl-button--session")).toMatch(/min-block-size:\s*64px/);
    expect(body(".wl-button--session")).toMatch(/--wl-radius-session-button/);
    expect(body(".wl-option:has(input:checked)")).toMatch(/--wl-space-option-bleed/);
    expect(body(".wl-option:has(input:checked)")).toMatch(/--wl-radius-option/);
    expect(body(".wl-segmented")).toMatch(/border:\s*1px solid var\(--wl-line\)/);
    expect(body(".wl-chip")).toMatch(/padding:\s*8px 14px/);
    const own = rules.filter((r) => r.selectors.every((s) => SCOPED.test(s)));
    for (const r of own) {
      expect(r.body, r.selectors.join()).not.toMatch(
        /--wl-color-(bg|text|accent|surface|line|on-accent|warn)\b/,
      );
    }
  });
});

// T-0593 AC8: the toggle, input, sheet, scrim and paper rules follow the same scoping rule.
describe("T-0593 scoping and values of the shared surfaces (D-0210 §3, D-0211 §5)", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...stripped.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!
      .replace(/\s+/g, " ")
      .trim()
      .split(/,(?![^(]*\))/)
      .map((x) => x.trim()),
    body: m[2]!,
  }));
  // A selector matches when it ends with `sel`, so ".wl-input" is not ".wl-input:hover".
  const bodyOf = (sel: string) =>
    rules
      .filter((r) => r.selectors.some((s) => s.endsWith(sel)))
      .map((r) => r.body)
      .join("\n");
  const SCOPED = /^(:is\((\[data-wl-state[^\]]*\]|\.wl-paper)|\[data-wl-state[^\]]*\]|\.wl-paper)/;

  it("every .wl-input rule that reads a state variable starts at a state root or paper", () => {
    const hits = rules.filter((r) => r.selectors.some((s) => /\.wl-input\b(?!__)/.test(s)));
    expect(hits.length).toBeGreaterThan(5);
    const legacy = hits.filter((r) => r.selectors.some((s) => !SCOPED.test(s)));
    expect(legacy).toHaveLength(1);
    expect(legacy[0]!.body).toMatch(/border:\s*1px solid var\(--wl-ink-muted\)/);
    expect(legacy[0]!.body).not.toMatch(/--wl-(radius|attention|focus)\b/);
  });

  it("the toggle is 48 x 28 with a 1.5px muted outline and a selected on-state", () => {
    expect(bodyOf(".wl-toggle > input")).toMatch(/inline-size:\s*48px/);
    expect(bodyOf(".wl-toggle > input")).toMatch(/block-size:\s*28px/);
    expect(bodyOf(".wl-toggle > input")).toMatch(/border:\s*1\.5px solid var\(--wl-ink-muted\)/);
    expect(bodyOf(".wl-toggle > input:checked")).toMatch(/background:\s*var\(--wl-selected\)/);
    expect(bodyOf(".wl-toggle > input:checked::after")).toMatch(/var\(--wl-on-selected\)/);
  });

  it("the input error is a 2px attention border; lift and rest show the icon, plan and paper do not", () => {
    expect(bodyOf('.wl-input[aria-invalid="true"]')).toMatch(
      /border:\s*2px solid var\(--wl-attention\)/,
    );
    expect(bodyOf(".wl-input__error")).toMatch(/color:\s*var\(--wl-attention\)/);
    expect(bodyOf(".wl-input")).toMatch(/border-radius:\s*var\(--wl-radius-input\)/);
  });

  it("the sheet, grabber, scrim and paper carry the spec values", () => {
    const sheet = bodyOf("[data-wl-state].wl-sheet");
    expect(sheet).toMatch(/inset-block:\s*150px 0/);
    expect(sheet).toMatch(/border-radius:\s*var\(--wl-radius-sheet\) var\(--wl-radius-sheet\) 0 0/);
    expect(sheet).toMatch(/transition:\s*none/);
    expect(bodyOf(".wl-sheet__grabber")).toMatch(/inline-size:\s*40px/);
    expect(bodyOf(".wl-sheet__grabber")).toMatch(/block-size:\s*4px/);
    expect(bodyOf(".wl-sheet__grabber")).toMatch(/background:\s*var\(--wl-line\)/);
    expect(bodyOf(".wl-sheet-scrim")).toMatch(
      /color-mix\(in oklch, var\(--wl-color-plan-scrim\) 45%, transparent\)/,
    );
    const paper = rules.filter(
      (r) => r.selectors.includes(".wl-paper") && /margin-inline/.test(r.body),
    );
    expect(paper).toHaveLength(1);
    expect(paper[0]!.body).toMatch(/margin-inline:\s*calc\(-1 \* var\(--wl-gutter\)\)/);
    expect(paper[0]!.body).toMatch(/padding:\s*20px var\(--wl-gutter\)/);
    expect(paper[0]!.body).toMatch(/border-radius:\s*0/);
  });

  it("the account-deleted notice keeps the base surface and reads raise, ink and tile radius in a state", () => {
    const rule = (sel: string) => rules.filter((r) => r.selectors.includes(sel)).map((r) => r.body);
    const base = rule(".wl-account-deleted").join("\n");
    expect(base).toMatch(/background:\s*var\(--wl-raise\)/);
    expect(base).not.toMatch(/--wl-radius/);
    const scoped = bodyOf(".wl-account-deleted").split("\n").join(" ");
    expect(scoped).toMatch(/background:\s*var\(--wl-raise\)/);
    expect(scoped).toMatch(/color:\s*var\(--wl-ink\)/);
    expect(scoped).toMatch(/border-radius:\s*var\(--wl-radius-tile\)/);
  });
});

// T-0630: the sheet stacks above the tab bar, the scrim needs no state ancestor, and a plan sheet in
// a lift or rest root keeps the plan type sizes.
describe("T-0630 sheet stacking, portalled scrim and nested plan type (D-0216)", () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...stripped.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!
      .replace(/\s+/g, " ")
      .trim()
      .split(/,(?![^(]*\))/)
      .map((x) => x.trim()),
    body: m[2]!,
  }));
  const exact = (sel: string) =>
    rules
      .filter((r) => r.selectors.includes(sel))
      .map((r) => r.body)
      .join("\n");
  const z = (b: string) => Number(/z-index:\s*(\d+)/.exec(b)?.[1]);
  const tabBar = readFileSync(resolve(__dirname, "../../components/tab-bar/tab-bar.css"), "utf8");

  it("AC1 sheet and scrim have z-index above the tab bar, the sheet above the scrim", () => {
    const bar = z(/\.wl-tab-bar\s*\{[^}]*\}/.exec(tabBar)![0]);
    const scrim = z(exact(".wl-sheet-scrim"));
    const sheet = z(exact("[data-wl-state].wl-sheet"));
    expect(scrim).toBeGreaterThan(bar);
    expect(sheet).toBeGreaterThan(scrim);
  });

  it("AC2 the scrim rule has no state ancestor and carries the plan scrim at 0.45", () => {
    const body = exact(".wl-sheet-scrim");
    expect(body).toMatch(/color-mix\(in oklch, var\(--wl-color-plan-scrim\) 45%, transparent\)/);
    expect(body).not.toMatch(/--wl-scrim\b/);
    expect(body).toMatch(/transition:\s*none/);
  });

  it("AC3 a nested plan sheet restores the plan sizes after the lift and rest overrides", () => {
    const P = ':is([data-wl-state="lift"], [data-wl-state="rest"]) .wl-sheet[data-wl-state="plan"]';
    expect(exact(`${P} .wl-type-label`)).toMatch(/font-size:\s*0\.875rem/);
    expect(exact(`${P} :where(h2, h3)`)).toMatch(/font-weight:\s*600/);
    expect(exact(`${P} .wl-type-button`)).toMatch(/font-size:\s*1\.375rem/);
    expect(exact(`${P} .wl-type-section`)).toMatch(/font-size:\s*2\.75rem/);
    const idx = (sel: string) => rules.findIndex((r) => r.selectors.includes(sel));
    expect(idx(`${P} .wl-type-label`)).toBeGreaterThan(
      idx('[data-wl-state="lift"] .wl-type-label'),
    );
  });

  it("T-0678 the hidden radio is a full-size invisible target over its label", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const m = stripped.match(/\.wl-segmented input\[type="radio"\]\s*\{([^}]*)\}/);
    const body = m?.[1] ?? "";
    // The same block hides all three inputs: its selector list names each one.
    const head = stripped.slice(0, stripped.indexOf(m?.[0] ?? "\0"));
    expect(head.slice(head.lastIndexOf("}"))).toMatch(
      /\.wl-option > input\[type="radio"\],[\s\S]*\.wl-chip > input,/,
    );
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/inset:\s*0/);
    expect(body).toMatch(/inline-size:\s*100%/);
    expect(body).toMatch(/block-size:\s*100%/);
    expect(body).toMatch(/margin:\s*0/);
    expect(body).toMatch(/opacity:\s*0/);
    expect(body).toMatch(/cursor:\s*pointer/);
    expect(body).not.toMatch(/pointer-events:\s*none/);
  });
});
