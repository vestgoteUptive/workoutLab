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

describe("T-0532 excluded-exercises design specs (D-0199)", () => {
  const files = [
    "components/c-03-checkbox.md",
    "components/neutral-notice.md",
    "screens/UF-11.5.md",
    "screens/UF-11.2.md",
    "screens/UF-08.2.md",
    "screens/UF-08.3-UF-05.1.md",
    "screens/UF-04.1-UF-04.2.md",
  ];
  const read = (f: string) => readFileSync(resolve(designDir, f), "utf8");
  it("names no warn token and no hex in any new file (neutral notice, no raw colour)", () => {
    for (const f of files) {
      const t = read(f);
      expect(t, f).not.toMatch(/warn/i);
      expect(t, f).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
    }
  });
  it("neutral notice names its tokens and the info icon", () => {
    const t = read("components/neutral-notice.md");
    for (const s of ["surface-2", "line", "text-muted", "info icon", "2 px stroke"])
      expect(t).toContain(s);
  });
  it("UF-08.2 and UF-11.5 carry both notice strings", () => {
    for (const f of ["screens/UF-08.2.md", "screens/UF-11.5.md"]) {
      const t = read(f);
      expect(t, f).toContain("Not suggested: {areas}. Every exercise for them is excluded.");
      expect(t, f).toContain("Not suggested: {area}. Every exercise for it is excluded.");
    }
  });
  it("C-03 spec: native input in label, 24 px box, 44 px row, border token", () => {
    const t = read("components/c-03-checkbox.md");
    for (const s of [
      '<input type="checkbox">',
      "<label>",
      "24 × 24 px",
      "44 px",
      "`text-muted`",
      "aria-disabled",
      "Focus-visible",
    ]) {
      expect(t).toContain(s);
    }
  });
  it("every screen spec cites D-0199 and its a11y rules", () => {
    for (const f of files.filter((x) => x.startsWith("screens/"))) {
      const t = read(f);
      expect(t, f).toContain("D-0199");
      expect(t, f).toContain("44 px");
      // UF-11.2 is a navigation link only: it has no write control to disable.
      if (!f.endsWith("UF-11.2.md")) expect(t, f).toMatch(/aria-disabled/);
      expect(t, f).toMatch(/role="alert"|Offline/);
    }
    expect(read("screens/UF-08.2.md")).toContain('role="status"');
    expect(read("screens/UF-11.5.md")).toContain("Connect to change excluded exercises");
  });
  it("no spec adds a UF-09 control", () => {
    for (const f of files.filter((x) => x.startsWith("screens/"))) {
      expect(read(f), f).toMatch(/No UF-09 control is added|Nothing is added to UF-09|not UF-09/);
    }
  });
});
