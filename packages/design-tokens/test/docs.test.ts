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
  it("has a row for all 17 flat tokens with the tokens.json hex", () => {
    const flat = Object.entries(raw.color).filter(([, v]) => typeof v === "string");
    expect([...rows.keys()].sort()).toEqual(flat.map(([k]) => k).sort());
    for (const [name, hex] of flat) expect(rows.get(name)).toBe(hex);
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
  it("neutral notice names its Cobalt variables and the info icon (T-0590 AC2)", () => {
    const t = read("components/neutral-notice.md");
    for (const s of ["--wl-raise", "--wl-ink", "info icon", "2 px stroke", "6.2"])
      expect(t).toContain(s);
    expect(t).not.toMatch(/surface-2|accent|warn/i);
    expect(t).toContain("reserved for C-01 attention, errors and over time");
  });
  it("UF-08.2 and UF-11.5 carry both notice strings", () => {
    for (const f of ["screens/UF-08.2.md", "screens/UF-11.5.md"]) {
      const t = read(f);
      expect(t, f).toContain("Not suggested: {areas}. Every exercise for them is excluded.");
      expect(t, f).toContain("Not suggested: {area}. Every exercise for it is excluded.");
    }
  });
  it("C-03 spec: native input in label, 22 px box, 44 px row, Cobalt tokens (T-0590 AC1)", () => {
    const t = read("components/c-03-checkbox.md");
    for (const s of [
      '<input type="checkbox">',
      "<label>",
      "22 × 22 px",
      "44 px",
      "`--wl-ink-muted`",
      "`--wl-selected`",
      "`--wl-on-selected`",
      "aria-disabled",
      "Focus-visible",
    ]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/\baccent\b|on-accent|warn|24 × 24/i);
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

describe("T-0583 AC6 design-system.md documents Cobalt + state colour (D-0208)", () => {
  const md = readFileSync(resolve(designDir, "design-system.md"), "utf8");
  const states = ["plan", "lift", "rest", "paper"] as const;

  /** Throws when the D-0208 section drifts from tokens.json. */
  function checkCobaltDoc(text: string): void {
    expect(text, "section heading").toContain("## Cobalt + state colour (D-0208)");
    expect(text, "Chalk & Iron kept").toContain(
      "## Chalk & Iron (D-0019) — in use until the app screens migrate",
    );
    const rows = new Map<string, string>();
    for (const m of text.matchAll(/^\|\s*`([a-z]+\.[a-z0-9-]+)`\s*\|\s*`(#[0-9A-F]{6})`\s*\|/gm)) {
      rows.set(m[1] as string, m[2] as string);
    }
    const expected = states.flatMap((s) =>
      Object.entries(raw.color[s]).map(([k, v]) => [`${s}.${k}`, v] as const),
    );
    expect([...rows.keys()].sort(), "one row per state token").toEqual(
      expected.map(([k]) => k).sort(),
    );
    for (const [k, v] of expected) expect(rows.get(k), `${k} hex`).toBe(v);
    for (let i = 0; i <= 4; i++) expect(text).toContain(`--wl-color-plan-coverage-${i}`);
  }

  it("state token table matches tokens.json, coverage ramp named", () => {
    checkCobaltDoc(md);
  });
  it("planted fault: a changed hex in the doc fails", () => {
    const faulty = md.replace("| `lift.bg` | `#CC4225` |", "| `lift.bg` | `#D9472B` |");
    expect(faulty).not.toBe(md);
    expect(() => checkCobaltDoc(faulty)).toThrow(/lift\.bg hex/);
  });
  it("has the contrast table with the README values", () => {
    for (const [pair, ratio] of [
      ["`plan.ink` (white) on `plan.bg`", "8.6"],
      ["`plan.ink-muted` on `plan.bg`", "5.9"],
      ["`plan.ink` (white) on `plan.raise`", "6.2"],
      ["`lift.ink` (white) on `lift.bg`", "4.8"],
      ["`rest.ink` (white) on `rest.bg`", "4.9"],
      ["`lift.on-action` on `lift.action` (white)", "6.1"],
      ["`rest.on-action` on `rest.action` (white)", "8.1"],
      ["`paper.ink` on `paper.bg`", "12.9"],
      ["`paper.ink-muted` on `paper.bg`", "6.5"],
      ["`plan.attention` on `plan.bg`", "5.0"],
    ]) {
      expect(md, pair).toContain(`| ${pair} | ${ratio} | 4.5 |`);
    }
  });
  it("documents the type roles in rem, both families and the no-raw-colours rule", () => {
    expect(md).toContain("### Type (D-0208)");
    expect(md).toContain(`Token \`--wl-font-plan\`: \`${raw.font.plan.family}\``);
    expect(md).toContain(`Token \`--wl-font-session\`: \`${raw.font.session.family}\``);
    expect(md).toContain("fonts-state.css");
    for (const role of ["Hero number", "Hero title", "Page title", "Section title", "Button"]) {
      expect(md).toMatch(new RegExp(`^\\| ${role} \\|[^\\n]*\\d+(?:\\.\\d+)?rem`, "m"));
    }
    const typeSection = md.slice(
      md.indexOf("### Type (D-0208)"),
      md.indexOf("### Spacing and radius"),
    );
    expect(typeSection).not.toMatch(/\d px\s*\|/);
    expect(md).toContain("**No raw colours.**");
    expect(md).toContain("`workoutlab/no-raw-colour`, `wl-check-colours`");
  });
});

describe("T-0590 state-patterns.md (D-0208, D-0211)", () => {
  const read = (f: string) => readFileSync(resolve(designDir, f), "utf8");
  const md = read("components/state-patterns.md");
  const patterns = [
    "Primary button",
    "Secondary button",
    "Text button",
    "Session button",
    "Row",
    "Selected option row",
    "Segmented control",
    "Chip",
    "Checkbox",
    "Toggle",
    "Input",
    "Sheet",
    "Paper panel",
    "Tab bar",
    "Session progress",
    "Drain fill",
  ];
  const sections = new Map<string, string>();
  const parts = md.split(/^## /m).slice(1);
  for (const p of parts) sections.set(p.split("\n")[0] as string, p);
  const section = (name: string): string => sections.get(name) ?? "";

  it("AC3 has exactly one section per pattern, in order", () => {
    expect(parts.map((p) => p.split("\n")[0])).toEqual(patterns);
  });
  it("AC3 every section names a --wl- variable and no hex", () => {
    for (const n of patterns) {
      expect(section(n), n).toMatch(/--wl-[a-z-]+/);
    }
    expect(md).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
  it("AC3 chip tick is aria-hidden; the selected option row keeps the native radio", () => {
    expect(section("Chip")).toMatch(/aria-hidden/);
    expect(section("Selected option row")).toMatch(/native radio stays/);
  });
  it("AC3 drain fill and sheet name prefers-reduced-motion", () => {
    expect(section("Drain fill")).toContain("prefers-reduced-motion");
    expect(section("Sheet")).toContain("prefers-reduced-motion");
  });
  it("AC3 every section with a control names a 44 x 44 target", () => {
    for (const n of patterns.filter((x) => x !== "Drain fill")) {
      expect(section(n), n).toMatch(/44 × 44 px/);
    }
  });
  it("carries the pattern rules from the ticket", () => {
    expect(section("Session button")).toMatch(/at least 64 px tall/);
    expect(md).toMatch(/Destructive actions[^\n]*secondary outline[^\n]*last/);
    const sheet = section("Sheet");
    for (const s of [
      "plan state even over lift",
      "radius 28",
      "40 × 4",
      "--wl-line",
      "plan.scrim",
      "45 %",
    ])
      expect(sheet).toContain(s);
    const paper = section("Paper panel");
    for (const s of ["Full-bleed", "18–22 px block padding"]) expect(paper).toContain(s);
    const prog = section("Session progress");
    for (const s of ["44 px", "4 px high", "radius.progress", "nowrap"]) expect(prog).toContain(s);
    const tab = section("Tab bar");
    for (const s of [
      "Text only",
      "--wl-ink",
      "2 px underline",
      "aria-current",
      "--wl-ink-muted",
      "D-0196",
    ])
      expect(tab).toContain(s);
    const input = section("Input");
    for (const s of ["1 px `--wl-ink-muted` boundary", "`tile`", "D-0211 §5"])
      expect(input).toContain(s);
  });
  it("AC4 uses the D-0211 §4 values and cites ink-muted on plan.bg 5.9 for Input and Checkbox", () => {
    for (const v of ["8.6", "5.9", "6.2", "4.9", "4.8", "8.1", "12.9", "6.5", "5.0", "6.1"])
      expect(md).toContain(v);
    for (const n of ["Input", "Checkbox"])
      expect(section(n), n).toMatch(/`(plan\.)?(--wl-)?ink-muted` on `plan\.bg` 5\.9/);
  });
  it("AC5 UF-11.2 drops the sign-off sentence and cites D-0203 §3 and H-32", () => {
    const t = read("screens/UF-11.2.md");
    expect(t).not.toContain("needs product sign-off");
    expect(t).toContain("D-0203 §3");
    expect(t).toContain("H-32");
    expect(t).toContain("plan.ink-on-raise");
  });
  it("the plan screens carry the Look line and the prototype note is in place", () => {
    for (const f of [
      "UF-11.2",
      "UF-11.4",
      "UF-11.5",
      "UF-11.6",
      "UF-08.2",
      "UF-08.5",
      "UF-08.3-UF-05.1",
      "UF-09.9",
    ])
      expect(read(`screens/${f}.md`), f).toContain(
        "Cobalt + state colour (D-0208); state `plan`; patterns in `components/state-patterns.md`",
      );
    expect(read("prototype/README.md")).toContain(
      "Chalk & Iron prototypes, superseded for the look by D-0208; still valid for layout order and copy.",
    );
  });
});
