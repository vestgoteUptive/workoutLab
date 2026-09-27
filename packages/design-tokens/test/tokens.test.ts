import { differenceEuclidean, interpolate, oklch } from "culori";
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import * as api from "../src/index";
import { attentionLegend, coverageLegend, coverageTokens, tokens } from "../src/index";
import { contrast } from "./helpers";

const c = tokens.color;
const DESIGN_SYSTEM = {
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
};

describe("AC1 palette matches design system", () => {
  it("has exactly the 17 colour keys in order", () => {
    expect(Object.keys(c)).toEqual([
      "bg",
      "bg-focus",
      "surface",
      "surface-2",
      "line",
      "line-strong",
      "text",
      "text-muted",
      "accent",
      "accent-hover",
      "warn",
      "on-accent",
      "coverage-0",
      "coverage-1",
      "coverage-2",
      "coverage-3",
      "coverage-4",
    ]);
  });
  it("first eleven equal the design system, on-accent = #121210", () => {
    expect(Object.fromEntries(Object.entries(c).slice(0, 11))).toEqual(DESIGN_SYSTEM);
    expect(c["on-accent"]).toBe("#121210");
  });
  it("every value is uppercase 6-digit hex", () => {
    for (const v of Object.values(c)) expect(v).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("AC2 ramp endpoints (D-0003)", () => {
  it("coverage-0 = surface-2 and coverage-4 = accent", () => {
    expect(c["coverage-0"]).toBe("#2A2925");
    expect(c["coverage-0"]).toBe(c["surface-2"]);
    expect(c["coverage-4"]).toBe("#D4F25A");
    expect(c["coverage-4"]).toBe(c.accent);
  });
});

describe("AC3 OKLCH interpolation (D-0003/D-0019)", () => {
  const ramp = interpolate(["#2A2925", "#D4F25A"], "oklch");
  const deltaE = differenceEuclidean("oklab");
  it.each([
    ["coverage-1", 0.25],
    ["coverage-2", 0.5],
    ["coverage-3", 0.75],
  ] as const)("%s is within ΔE_OK 0.02 of t=%s", (name, t) => {
    expect(deltaE(c[name], ramp(t))).toBeLessThanOrEqual(0.02);
  });
  it("OKLCH lightness strictly increases from coverage-0 to coverage-4", () => {
    const ls = coverageTokens.map((t) => oklch(c[t])?.l ?? Number.NaN);
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1] as number);
  });
});

describe("AC4 non-text contrast flag (D-0003)", () => {
  it("meta.coverage[n].requiresLabel === contrast(step, bg) < 3", () => {
    expect(raw.meta.coverage).toHaveLength(5);
    coverageTokens.forEach((t, n) => {
      const entry = raw.meta.coverage[n];
      expect(Object.keys(entry ?? {})).toEqual(["requiresLabel"]);
      expect(entry?.requiresLabel).toBe(contrast(c[t], c.bg) < 3.0);
    });
    expect(raw.meta.coverage[0]?.requiresLabel).toBe(true);
  });
});

describe("AC5 text and outline contrast (NFR-A11Y-1)", () => {
  it.each([
    ["text", "bg"],
    ["text", "bg-focus"],
    ["text", "surface"],
    ["text-muted", "bg"],
    ["text-muted", "bg-focus"],
    ["text-muted", "surface"],
    ["on-accent", "accent"],
    ["on-accent", "accent-hover"],
  ] as const)("%s on %s ≥ 4.5", (fg, bgName) => {
    expect(contrast(c[fg], c[bgName])).toBeGreaterThanOrEqual(4.5);
  });
  it.each([["bg"], ["surface-2"]] as const)("warn outline on %s ≥ 3.0", (bgName) => {
    expect(contrast(c.warn, c[bgName])).toBeGreaterThanOrEqual(3.0);
  });
});

describe("AC6 C-01 legend data (D-0013/D-0019)", () => {
  it("coverageLegend has the five steps with exact copy", () => {
    expect(coverageLegend).toEqual([
      { step: 0, token: "coverage-0", label: "None", srLabel: "No hard sets" },
      { step: 1, token: "coverage-1", label: "Under ⅓", srLabel: "Under one third of target" },
      { step: 2, token: "coverage-2", label: "Under ⅔", srLabel: "Under two thirds of target" },
      { step: 3, token: "coverage-3", label: "Under target", srLabel: "Under target" },
      { step: 4, token: "coverage-4", label: "On target", srLabel: "On target or over" },
    ]);
  });
  it("attentionLegend is the 2 px warn outline", () => {
    expect(attentionLegend).toEqual({
      token: "warn",
      style: "outline",
      widthPx: 2,
      label: "Needs attention",
      srLabel: "Needs attention",
    });
  });
  it("coverageTokens lists coverage-0..4", () => {
    expect(coverageTokens).toEqual([
      "coverage-0",
      "coverage-1",
      "coverage-2",
      "coverage-3",
      "coverage-4",
    ]);
  });
});

describe("AC7 tokens compute nothing (principle 3)", () => {
  const all: unknown[] = [];
  const walk = (v: unknown): void => {
    all.push(v);
    if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  Object.values(api).forEach(walk);

  it("no export is a function (deeply)", () => {
    expect(Object.keys(api).length).toBeGreaterThan(0);
    for (const v of all) expect(typeof v).not.toBe("function");
  });
  it("no export contains the thresholds 0.33 or 0.66", () => {
    expect(all).not.toContain(0.33);
    expect(all).not.toContain(0.66);
    const text = JSON.stringify(api);
    expect(text).not.toMatch(/0\.33|0\.66/);
  });
});

describe("AC10 fonts", () => {
  const { display, body } = tokens.font;
  it("family stacks start with the web font and end with sans-serif", () => {
    expect(display.family.startsWith('"Big Shoulders Display"')).toBe(true);
    expect(body.family.startsWith('"DM Sans"')).toBe(true);
    expect(display.family.trim().endsWith("sans-serif")).toBe(true);
    expect(body.family.trim().endsWith("sans-serif")).toBe(true);
  });
  it("weights match the design system", () => {
    expect(display.weights).toEqual([700, 800]);
    expect(body.weights).toEqual([400, 500, 700]);
  });
});
