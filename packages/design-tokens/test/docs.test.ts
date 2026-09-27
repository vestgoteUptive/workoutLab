import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import { coverageLegend } from "../src/index";
import { repoRoot } from "./helpers";

const designDir = resolve(repoRoot, "Design-docs/docs/design");

describe("AC16 C-01 legend spec", () => {
  const spec = readFileSync(resolve(designDir, "components/c-01-body-map.md"), "utf8");
  it("names every coverage token and legend label", () => {
    for (const t of ["coverage-0", "coverage-1", "coverage-2", "coverage-3", "coverage-4"]) {
      expect(spec).toContain(t);
    }
    for (const { label } of coverageLegend) expect(spec).toContain(label);
  });
  it("describes the attention outline", () => {
    expect(spec).toContain("Needs attention");
    expect(spec).toContain("2 px");
    expect(spec).toContain("`warn`");
    expect(spec).toContain("outline, never fill");
  });
  it("gives the D-0013 step mapping", () => {
    expect(spec).toContain("0 / <0.33 / <0.66 / <1 / ≥1");
    expect(spec).toContain("D-0013");
  });
  it("names the screens and the required sentences", () => {
    expect(spec).toContain("UF-02.1");
    expect(spec).toContain("UF-10.1");
    expect(spec).toContain("Every area shows its numeric label (NFR-A11Y-3)");
    expect(spec).toContain("C-01 is never shown on UF-08.* or UF-09.*");
  });
});

describe("AC17 design-system.md doesn't drift", () => {
  const md = readFileSync(resolve(designDir, "design-system.md"), "utf8");
  const rows = new Map<string, string>();
  for (const m of md.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm)) {
    rows.set(m[1] as string, m[2] as string);
  }
  it("has a row for all 17 tokens with the tokens.json hex", () => {
    expect([...rows.keys()].sort()).toEqual(Object.keys(raw.color).sort());
    for (const [name, hex] of Object.entries(raw.color)) expect(rows.get(name)).toBe(hex);
  });
});
