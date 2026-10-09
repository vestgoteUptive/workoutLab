// T-0583 (D-0208): Cobalt state groups, OKLCH plan coverage ramp, radius/space groups.
// AC1 values, AC2 CSS variables, AC3 ramp, AC4 contrast, AC7 colour guard.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { differenceEuclidean, formatHex, interpolate, oklch } from "culori";
import { afterAll, describe, expect, expectTypeOf, it } from "vitest";
import raw from "../src/tokens.json";
import {
  colorStates,
  planCoverageTokens,
  tokens,
  type ColorName,
  type StateColorName,
} from "../src/index";
import { contrast, pkgRoot, runCli } from "./helpers";

type Raw = typeof raw;

// The proposed values (Design-docs/docs/design/redesign-cobalt/tokens.proposed.json on branch
// design/redesign-cobalt), except lift.bg, which D-0208 §5 fixes at #CC4225. Written as the
// expected contract here so a changed hex in tokens.json goes red.
const W = "#FFFFFF";
const PROPOSED = {
  plan: {
    bg: "#2337C6",
    raise: "#3B50DD",
    line: "#6676DA",
    ink: W,
    "ink-muted": "#C9D3FF",
    action: W,
    "on-action": "#2337C6",
    attention: "#FFB3A3",
    selected: W,
    "on-selected": "#2337C6",
  },
  lift: {
    bg: "#CC4225",
    "bg-deep": "#B33520",
    line: "#EE8E7B",
    ink: W,
    action: W,
    "on-action": "#B33520",
    "progress-off": "#EE8E7B",
  },
  rest: {
    bg: "#3F7A76",
    line: "#7FA8A4",
    ink: W,
    action: W,
    "on-action": "#2C5754",
    "progress-off": "#7FA8A4",
  },
  paper: {
    bg: "#F4F3EE",
    line: "#D6D6E4",
    ink: "#1A2266",
    "ink-muted": "#4A5290",
    action: "#2337C6",
    "on-action": W,
  },
} as const;

const FLAT_BEFORE = {
  bg: "#121210",
  "bg-focus": "#0B0B0A",
  surface: "#1D1C19",
  "surface-2": "#2A2925",
  line: "#2E2C28",
  "line-strong": "#3A3833",
  text: "#F2EFE8",
  "text-muted": "#A8A398",
  accent: "#D4F25A",
  "accent-hover": "#E6FA95",
  warn: "#FF8A3D",
  "on-accent": "#121210",
  "coverage-0": "#2A2925",
  "coverage-1": "#585332",
  "coverage-2": "#85833D",
  "coverage-3": "#AFB849",
  "coverage-4": "#D4F25A",
};

describe("AC1 state groups carry the exact proposed hex (D-0208)", () => {
  it("plan, lift, rest and paper equal tokens.proposed.json (lift.bg #CC4225)", () => {
    // T-0587 (D-0211 §1) adds plan.ink-on-raise and plan.scrim on top of the proposal.
    const ADDED: Partial<Record<(typeof colorStates)[number], Record<string, string>>> = {
      plan: { "ink-on-raise": "#DDE3FF", scrim: "#0E1652" },
    };
    for (const state of colorStates)
      expect(raw.color[state], state).toEqual({ ...PROPOSED[state], ...ADDED[state] });
    expect(colorStates).toEqual(["plan", "lift", "rest", "paper"]);
  });
  it("lift.bg is #CC4225, not the mock's #D9472B", () => {
    expect(raw.color.lift.bg).toBe("#CC4225");
    expect(raw.color.lift.bg).not.toBe("#D9472B");
  });
  it("every state colour is uppercase #RRGGBB", () => {
    for (const state of colorStates)
      for (const v of Object.values(raw.color[state])) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("coverage spec, fonts, radius and space match the proposal", () => {
    expect(raw.color.coverage).toEqual({
      from: "#3B50DD",
      to: W,
      interpolation: "oklch",
      steps: 5,
    });
    expect(raw.color.coverage.from).toBe(raw.color.plan.raise);
    expect(raw.font.plan).toEqual({
      family: '"Familjen Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif',
      weights: [400, 600, 700],
    });
    expect(raw.font.session).toEqual({
      family: '"Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif',
      weights: [400, 600, 800],
    });
    expect(raw.radius).toEqual({
      pill: 999,
      "session-button": 22,
      sheet: 28,
      option: 16,
      tile: 12,
      input: 12,
      segment: 4,
      progress: 2, // T-0587 (D-0211 §1)
    });
    expect(raw.space).toEqual({
      "gutter-plan": 28,
      "gutter-session": 26,
      "top-safe": 72,
      "bottom-safe": 44,
      "option-bleed": 18, // T-0587 (D-0211 §1)
    });
    expect(raw.meta.states).toEqual(["plan", "lift", "rest"]);
  });
  it("the flat Chalk & Iron keys and fonts are unchanged (additive change)", () => {
    const flat = Object.fromEntries(
      Object.entries(raw.color).filter(([, v]) => typeof v === "string"),
    );
    expect(flat).toEqual(FLAT_BEFORE);
    expect(raw.font.display.family.startsWith('"Big Shoulders Display"')).toBe(true);
    expect(raw.font.body.family.startsWith('"DM Sans"')).toBe(true);
  });
  it("types: StateColorName and ColorName stay apart", () => {
    expectTypeOf<"plan-ink-muted">().toMatchTypeOf<StateColorName<"plan">>();
    expectTypeOf<"lift-bg-deep">().toMatchTypeOf<StateColorName<"lift">>();
    // @ts-expect-error a nested group is not a flat colour name (checked by `pnpm typecheck`).
    const notFlat: ColorName = "plan";
    expect(notFlat).toBe("plan");
    expect(tokens.color.plan.bg).toBe(raw.color.plan.bg);
  });
});

// --- Built CSS
const tmp = mkdtempSync(join(tmpdir(), "wl-tokens-cobalt-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
function buildCss(): string {
  const out = join(tmp, "tokens.css");
  const res = spawnSync(
    process.execPath,
    [resolve(pkgRoot, "scripts/build-css.mjs"), "--out", out],
    { encoding: "utf8" },
  );
  expect(res.status, res.stderr).toBe(0);
  return readFileSync(out, "utf8");
}
const css = buildCss();
function cssVar(name: string): string | undefined {
  return new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(css)?.[1];
}

describe("AC2 tokens.css emits the D-0208 variables", () => {
  it("one --wl-color-<state>-<name> per state colour", () => {
    let n = 0;
    for (const state of colorStates) {
      for (const [name, hex] of Object.entries(raw.color[state])) {
        expect(cssVar(`--wl-color-${state}-${name}`), `${state}-${name}`).toBe(hex);
        n++;
      }
    }
    expect(n).toBe(31); // 29 (T-0583) + plan.ink-on-raise + plan.scrim (T-0587)
    expect(css).not.toMatch(/object Object/);
    expect(css).not.toMatch(/--wl-color-(plan|lift|rest|paper|coverage):/);
  });
  it("--wl-font-plan, --wl-font-session, radius and space", () => {
    expect(cssVar("--wl-font-plan")).toBe(raw.font.plan.family);
    expect(cssVar("--wl-font-session")).toBe(raw.font.session.family);
    for (const r of ["pill", "session-button", "sheet", "option", "tile", "input", "segment"]) {
      const v = raw.radius[r as keyof Raw["radius"]];
      expect(cssVar(`--wl-radius-${r}`), r).toBe(`${v}px`);
    }
    for (const s of ["gutter-plan", "gutter-session", "top-safe", "bottom-safe"]) {
      const v = raw.space[s as keyof Raw["space"]];
      expect(cssVar(`--wl-space-${s}`), s).toBe(`${v}px`);
    }
    expect(cssVar("--wl-space-gutter-plan")).toBe("28px");
    expect(cssVar("--wl-space-gutter-session")).toBe("26px");
  });
  it("existing variables are unchanged", () => {
    for (const [name, hex] of Object.entries(FLAT_BEFORE))
      expect(cssVar(`--wl-color-${name}`), name).toBe(hex);
    expect(cssVar("--wl-font-display")).toBe(raw.font.display.family);
    expect(cssVar("--wl-font-body")).toBe(raw.font.body.family);
  });
  it("no CSS variable is declared twice", () => {
    const names = [...css.matchAll(/^\s*(--wl-[a-z0-9-]+):/gm)].map((m) => m[1]);
    expect(new Set(names).size).toBe(names.length);
  });
});

// --- AC3 ramp
const deltaE = differenceEuclidean("oklab");
/** Throws when a ramp isn't the OKLCH interpolation of from → to in `steps` stops. */
function checkRamp(stops: readonly string[], spec: Raw["color"]["coverage"]): void {
  expect(stops, "stop count").toHaveLength(spec.steps);
  expect(stops[0], "first stop").toBe(spec.from);
  expect(stops[stops.length - 1], "last stop").toBe(spec.to);
  const ref = interpolate([spec.from, spec.to], "oklch");
  stops.forEach((hex, i) => {
    const t = i / (spec.steps - 1);
    expect(hex, `stop ${i} is #RRGGBB`).toMatch(/^#[0-9A-F]{6}$/);
    expect(deltaE(hex, ref(t)), `stop ${i} within ΔE_OK 0.005 of OKLCH t=${t}`).toBeLessThanOrEqual(
      0.005,
    );
  });
  const ls = stops.map((h) => oklch(h)?.l ?? Number.NaN);
  for (let i = 1; i < ls.length; i++)
    expect(ls[i], `lightness ${i} > ${i - 1}`).toBeGreaterThan(ls[i - 1] as number);
}

describe("AC3 plan coverage ramp is OKLCH (D-0208)", () => {
  const stops = [...css.matchAll(/--wl-color-plan-coverage-(\d+):\s*([^;]+);/g)].map((m) => ({
    i: Number(m[1]),
    hex: m[2] as string,
  }));

  it("exactly 5 stops, -0 = #3B50DD and -4 = #FFFFFF", () => {
    expect(stops.map((s) => s.i)).toEqual([0, 1, 2, 3, 4]);
    expect(cssVar("--wl-color-plan-coverage-0")).toBe("#3B50DD");
    expect(cssVar("--wl-color-plan-coverage-4")).toBe("#FFFFFF");
    expect(planCoverageTokens).toEqual(stops.map((s) => `plan-coverage-${s.i}`));
  });
  it("matches the culori OKLCH reference and rises in OKLCH lightness", () => {
    checkRamp(
      stops.map((s) => s.hex),
      raw.color.coverage,
    );
    // Same hex as the reference once rounded to 8-bit sRGB.
    const ref = interpolate([raw.color.coverage.from, raw.color.coverage.to], "oklch");
    expect(stops.map((s) => s.hex)).toEqual(
      [0, 0.25, 0.5, 0.75, 1].map((t) => formatHex(ref(t)).toUpperCase()),
    );
  });
  it("planted fault: an sRGB-interpolated ramp fails the OKLCH check", () => {
    const rgb = interpolate([raw.color.coverage.from, raw.color.coverage.to], "rgb");
    const faulty = [0, 0.25, 0.5, 0.75, 1].map((t) => formatHex(rgb(t)).toUpperCase());
    faulty[0] = raw.color.coverage.from;
    faulty[4] = raw.color.coverage.to;
    expect(() => checkRamp(faulty, raw.color.coverage)).toThrow(/within ΔE_OK/);
  });
  it("planted fault: a sixth stop fails", () => {
    const six = [...stops.map((s) => s.hex), "#FFFFFF"];
    expect(() => checkRamp(six, raw.color.coverage)).toThrow(/stop count/);
  });
});

// --- AC4 contrast
// README "Contrast" values are rounded to one decimal, so a pair passes when its ratio rounds
// (to one decimal) to at least that value. Text pairs must also clear the WCAG 4.5 floor
// unrounded (D-0209).
type Pair = readonly [label: string, fg: string, bg: string, min: number];
function contrastPairs(t: Raw): Pair[] {
  const { plan, lift, rest, paper } = t.color;
  return [
    ["white on plan.bg", plan.ink, plan.bg, 8.6],
    ["ink-muted on plan.bg", plan["ink-muted"], plan.bg, 5.9],
    ["white on plan.raise", plan.ink, plan.raise, 6.2],
    ["white on lift.bg", lift.ink, lift.bg, 4.8],
    ["white on rest.bg", rest.ink, rest.bg, 4.9],
    ["lift.on-action on white", lift["on-action"], lift.action, 6.1],
    ["rest.on-action on white", rest["on-action"], rest.action, 8.1],
    ["paper ink on paper.bg", paper.ink, paper.bg, 12.9],
    ["paper ink-muted on paper.bg", paper["ink-muted"], paper.bg, 6.5],
    ["attention on plan.bg", plan.attention, plan.bg, 5.0],
    ["plan.on-action on plan.action", plan["on-action"], plan.action, 4.5],
    ["paper.on-action on paper.action", paper["on-action"], paper.action, 4.5],
  ];
}
function checkContrast(t: Raw): void {
  for (const [label, fg, bg, min] of contrastPairs(t)) {
    const r = contrast(fg, bg);
    expect(Math.round(r * 10) / 10, `${label} ${r.toFixed(3)} ≥ ${min}`).toBeGreaterThanOrEqual(
      min,
    );
    expect(r, `${label} ${r.toFixed(3)} ≥ 4.5 (WCAG 2.2 AA text)`).toBeGreaterThanOrEqual(4.5);
  }
}
const withLiftBg = (hex: string): Raw => ({
  ...raw,
  color: { ...raw.color, lift: { ...raw.color.lift, bg: hex } },
});

describe("AC4 WCAG 2.2 contrast from the tokens (README Contrast)", () => {
  it("every README pair meets its measured value", () => {
    checkContrast(raw);
  });
  it("planted fault: lift.bg #D9472B fails white on lift.bg", () => {
    expect(() => checkContrast(withLiftBg("#D9472B"))).toThrow(/white on lift\.bg 4\.298/);
  });
  it("lift and rest differ by hue only (≈1.03:1), so session screens name their state in text", () => {
    expect(contrast(raw.color.lift.bg, raw.color.rest.bg)).toBeLessThan(1.1);
  });
});

describe("AC7 colour guard stays green", () => {
  it("wl-check-colours exits 0 on the design-tokens src (fonts-state.css) and the apps", () => {
    const res = runCli([
      resolve(pkgRoot, "src"),
      resolve(pkgRoot, "../../apps/web"),
      resolve(pkgRoot, "../../apps/landing"),
    ]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
  });
  it("src/index.ts names no colour literal", () => {
    const src = readFileSync(resolve(pkgRoot, "src/index.ts"), "utf8");
    expect(src).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
