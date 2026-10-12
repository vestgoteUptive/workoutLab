// D-0019 / D-0208 token data. T-0625 (D-0210 §6) removed the Chalk & Iron palette: the old AC1-AC5
// and AC10 (flat keys, lime ramp, meta.coverage, Big Shoulders / DM Sans) retired with it. The state
// groups, ramp and contrast are covered by cobalt.test.ts and cobalt-additions.test.ts.
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import * as api from "../src/index";
import { attentionLegend, coverageLegend } from "../src/index";

/** Throws unless color and font hold exactly the D-0208 groups (T-0625 AC1). */
function checkGroups(t: { color: object; font: object }): void {
  expect(Object.keys(t.color), "color keys").toEqual(["plan", "lift", "rest", "paper", "coverage"]);
  expect(Object.keys(t.font), "font keys").toEqual(["plan", "session"]);
}

describe("T-0625 AC1 only the state groups remain", () => {
  it("color is exactly plan, lift, rest, paper, coverage; font is exactly plan, session", () => {
    checkGroups(raw);
  });
  it("meta has no coverage list (planCoverage stays), radius has no segment", () => {
    expect(Object.keys(raw.meta)).toEqual(["planCoverage", "states"]);
    expect(Object.keys(raw.radius)).not.toContain("segment");
  });
  it("planted fault: a flat bg key fails", () => {
    expect(() => checkGroups({ ...raw, color: { bg: "#000000", ...raw.color } })).toThrow(
      /color keys/,
    );
  });
  it("planted fault: font.display fails", () => {
    expect(() =>
      checkGroups({ ...raw, font: { ...raw.font, display: { family: "x", weights: [] } } }),
    ).toThrow(/font keys/);
  });
});

describe("AC6 C-01 legend data (D-0013/D-0019)", () => {
  it("coverageLegend has the five steps with exact copy", () => {
    expect(coverageLegend).toEqual([
      { step: 0, token: "plan-coverage-0", label: "None", srLabel: "No hard sets" },
      { step: 1, token: "plan-coverage-1", label: "Under ⅓", srLabel: "Under one third of target" },
      {
        step: 2,
        token: "plan-coverage-2",
        label: "Under ⅔",
        srLabel: "Under two thirds of target",
      },
      { step: 3, token: "plan-coverage-3", label: "Under target", srLabel: "Under target" },
      { step: 4, token: "plan-coverage-4", label: "On target", srLabel: "On target or over" },
    ]);
  });
  it("attentionLegend is the 2 px plan-attention outline", () => {
    expect(attentionLegend).toEqual({
      token: "plan-attention",
      style: "outline",
      widthPx: 2,
      label: "Needs attention",
      srLabel: "Needs attention",
    });
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
