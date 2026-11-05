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
    // T-0614 (D-0211 §2): the plan tokens and their generic variables, not the lime ramp.
    for (let n = 0; n <= 4; n++) {
      expect(spec).toContain(`\`plan-coverage-${n}\``);
      expect(spec).toContain(`\`--wl-coverage-${n}\``);
    }
    for (const { label } of coverageLegend) expect(spec).toContain(label);
    expect(spec).toContain("meta.planCoverage");
  });
  it("describes the attention outline", () => {
    expect(spec).toContain("Needs attention");
    expect(spec).toContain("2 px");
    // T-0614 moved this pin from `warn` (D-0003) to the plan variable (D-0211 §5).
    expect(spec).toContain("`--wl-attention`");
    expect(spec).toContain("1 px `--wl-bg` gap");
    expect(spec).not.toMatch(/`(?:warn|accent|surface-2|text-muted)`/);
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
  // T-0625 (D-0210 §6): the 17 flat Chalk & Iron rows are gone with their tokens.
  it("has no flat token row and no Chalk & Iron section, type scale or font", () => {
    expect(md).not.toMatch(/^\|\s*`[a-z0-9-]+`\s*\|\s*`#[0-9A-Fa-f]{6}`\s*\|/m);
    expect(md).not.toMatch(/^## Chalk & Iron/m);
    expect(md).not.toMatch(/^## Type$/m);
    expect(md).not.toMatch(/--wl-font-(?:display|body)|--wl-color-coverage-/);
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
    expect(text, "Chalk & Iron retired (T-0625)").not.toContain("## Chalk & Iron");
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

// T-0681 (D-0230, D-0231, D-0233): editable level. UF-11.3 gets a spec with the Level radiogroup,
// UF-11.2 a Level fact, UF-11.6 a level notice with one link, UF-08.5 a text-only pointer.
describe("T-0681 editable level screen specs", () => {
  const read = (f: string) => readFileSync(resolve(designDir, f), "utf8");
  const HINTS = [
    "Under 6 months. We start with form-first variations like the goblet squat.",
    "6 months to 2 years. Barbell basics plus targeted accessories.",
    "2+ years. Adds the most demanding lifts, like the barbell deadlift.",
  ];
  // The retired Chalk & Iron colour names (T-0625): as bare compound names, or backticked short ones.
  const CHALK =
    /\b(?:surface-2|text-muted|line-strong|on-accent|accent-hover|bg-focus|accent|warn)\b/i;
  const CHALK_TICKED = /`(?:bg|surface|line|text)`/;
  const HEX = /#[0-9A-Fa-f]{3,8}\b/;

  /** The bold names of the numbered layout list, in order. */
  function sectionOrder(md: string): string[] {
    const start = md.indexOf("## Layout");
    const end = md.indexOf("\n## ", start + 1);
    const layout = md.slice(start, end);
    return [...layout.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map((m) => m[1] as string);
  }
  function checkOrder(md: string): void {
    const order = sectionOrder(md);
    const goal = order.indexOf("Goal");
    const level = order.indexOf("Level");
    const rhythm = order.indexOf("Rhythm");
    expect(goal, "Goal in the order list").toBeGreaterThanOrEqual(0);
    expect(level, "Level in the order list").toBeGreaterThan(goal);
    expect(rhythm, "Rhythm after Level").toBeGreaterThan(level);
  }

  it("T-0681 AC1 UF-11.3 spec: Level radiogroup, hints, note, order, no raw colour", () => {
    const t = read("screens/UF-11.3.md");
    expect(t).toContain("# UF-11.3 Edit plan");
    expect(t).toContain('named "Level"');
    for (const label of ["Beginner", "Intermediate", "Advanced"])
      expect(t).toContain(`| ${label} |`);
    for (const h of HINTS) expect(t).toContain(h);
    expect(t).toContain("Level changes which exercises we suggest, not your targets.");
    for (const s of ["aria-describedby", "radiogroup", ".wl-option"]) expect(t).toContain(s);
    expect(t).toMatch(/None of these is a live region/);
    for (const d of ["D-0230", "D-0233"]) expect(t).toContain(d);
    // Binary conditions: offline and the failed save are both specified.
    expect(t).toContain("Connect to save");
    expect(t).toContain("Couldn't update your plan. Try again.");
    expect(t).toContain('role="alert"');
    expect(t).toContain("/plan/edit?from=favorites");
    expect(t).toMatch(/focus moves to the UF-11\.6 title/);
    checkOrder(t);
    expect(sectionOrder(t)).toEqual([
      "Header",
      "Goal",
      "Level",
      "Rhythm",
      "Priority areas",
      "Target preview",
      "Save-failed alert and offline line",
      "Cancel and Save",
    ]);
    expect(t).not.toMatch(HEX);
    expect(t).not.toMatch(CHALK);
    expect(t).not.toMatch(CHALK_TICKED);
    expect(t).toMatch(/`--wl-[a-z-]+`/);
    expect(t).toContain("No UF-09 control is added");
  });
  it("T-0681 AC1 planted fault: Level dropped from the order list fails", () => {
    const t = read("screens/UF-11.3.md");
    const faulty = t.replace(/^3\. \*\*Level\*\*/m, "3. **Lvl**");
    expect(faulty).not.toBe(t);
    expect(() => checkOrder(faulty)).toThrow(/Level in the order list/);
  });
  it("T-0681 AC2 UF-11.2 'Your plan' facts read Goal, Level, Rhythm, Priority areas", () => {
    const t = read("screens/UF-11.2.md");
    const start = t.indexOf('### 4. "Your plan" card');
    const card = t.slice(start, t.indexOf("\n### ", start + 1));
    const dts = [...card.matchAll(/^\| (Goal|Level|Rhythm|Priority areas) \|/gm)].map((m) => m[1]);
    expect(dts).toEqual(["Goal", "Level", "Rhythm", "Priority areas"]);
    expect(card).toContain('| Level | "Beginner", "Intermediate" or "Advanced"');
    expect(card).toContain("four rows");
    expect(t).toContain("D-0230");
  });
  it("T-0681 AC3 UF-11.6 level notice with one link", () => {
    const t = read("screens/UF-11.6.md");
    for (const s of [
      "Your level is {Level}. Some favorites are above it.",
      "Change level",
      "/plan/edit?from=favorites",
      "D-0231",
      "D-0233",
      "with one link",
    ])
      expect(t).toContain(s);
    expect(t).not.toContain("no standing notice");
    // Shown and absent cases, and it stays while a query is typed.
    expect(t).toMatch(/\*\*Shown when\*\* at least one stored favorite reads "Above your level"/);
    expect(t).toMatch(/\*\*Absent when\*\* no row is above level/);
    expect(t).toMatch(/stays while the search query is non-empty/);
    expect(t).toMatch(/not a live region/);
    expect(t).toContain('tabindex="-1"');
    expect(t).not.toMatch(HEX);
  });
  it("T-0681 AC4 neutral notice gains the 'with one link' variant", () => {
    const t = read("components/neutral-notice.md");
    const start = t.indexOf("## Variant: with one link");
    expect(start).toBeGreaterThan(-1);
    const variant = t.slice(start, t.indexOf("\n## ", start + 1));
    for (const s of ["`--wl-ink`", "`--wl-focus`", "44 px", "one link", "not a live region"])
      expect(variant, s).toContain(s);
    expect(variant).toMatch(/never the attention colour/);
    expect(variant).toContain("at most one such notice per screen");
    expect(variant).toContain("D-0233 §7");
    expect(t).not.toMatch(HEX);
  });
  it("T-0681 AC5 UF-08.5 row 4 points to Edit plan in text only", () => {
    const t = read("screens/UF-08.5.md");
    expect(t).toMatch(/^\| 4 \| "Above your level\. Change it in Plan › Edit plan\." \|/m);
    expect(t).not.toContain("/plan/edit");
    expect(t).not.toMatch(/^\| 4 \| "Above your level" \|/m);
    expect(t).toContain("D-0231");
  });
  it("T-0681 AC6 UF-01.3 prototype: new Advanced hint and the change-later line", () => {
    const t = read("prototype/UF01-3-Experience.dc.html");
    expect(t).toContain("2+ years. Adds the most demanding lifts, like the barbell deadlift.");
    expect(t).toContain("You can change this later in Plan.");
    expect(t).not.toContain("Higher volume and advanced progression schemes");
    // The line sits under the level hint.
    expect(t.indexOf("You can change this later in Plan.")).toBeGreaterThan(
      t.indexOf("{{levelHint}}"),
    );
  });
  it("T-0681 AC7 the new and amended specs add no UF-09 control", () => {
    for (const f of ["screens/UF-11.3.md", "screens/UF-11.6.md", "screens/UF-08.5.md"]) {
      expect(read(f), f).toMatch(/No UF-09 control is added|Never reachable from[^.]*UF-09/);
    }
  });
});
