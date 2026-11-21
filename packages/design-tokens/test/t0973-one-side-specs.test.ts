// T-0973 (D-0261, D-0263 §4-§8, D-0208): the "per arm / per leg / per side" labels on UF-09.3,
// UF-09.4, UF-03, UF-06.2 and UF-04.2 are specified as text. Checked as text, like t0955.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pkgRoot, repoRoot } from "./helpers";

const screens = resolve(repoRoot, "Design-docs/docs/design/screens");
const read = (f: string) => {
  const p = resolve(screens, f);
  if (!existsSync(p)) throw new Error(`missing ${f}`);
  return readFileSync(p, "utf8");
};

/** The body under an exact heading line, up to the next heading of the same or a higher level. */
function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`no heading ${heading}`);
  const level = (/^#+/.exec(heading) as RegExpExecArray)[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) as RegExpExecArray)[0].length <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

const uf09 = read("UF-09.3-UF-09.4.md");
const uf04 = read("UF-04.1-UF-04.2.md");
const uf06 = read("UF-06.2.md");
const uf03 = read("UF-03.1-UF-03.3.md");
const hero = section(uf09, "## One side at a time: UF-09.3 hero line (D-0261, D-0263 §4)");
const stepper = section(uf09, "## One side at a time: UF-09.4 stepper (D-0261, D-0263 §5)");
const strings = section(
  uf09,
  "## One side at a time: the shared `formatReps` and `perSide` strings",
);
const howto = section(uf04, "## UF-04.2 One side at a time (D-0261, D-0263 §7)");
const hist06 = section(uf06, "## One side at a time (D-0261, D-0263 §6)");
const hist03 = section(uf03, "## One side at a time (D-0261, D-0263 §6)");

/** Contrast of two #rrggbb colours (WCAG 2.x). */
function ratio(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const tokens = JSON.parse(readFileSync(resolve(pkgRoot, "src/tokens.json"), "utf8"));
const c = tokens.color;

describe("T-0973 AC1 UF-09.3 hero lines and aria-labels", () => {
  it("gives weighted, bodyweight and timed lines", () => {
    expect(hero).toMatch(/"12 kg" over "× 10 per arm"/);
    expect(hero).toMatch(/"10 reps per arm"/);
    expect(hero).toMatch(/"40 s per side"/);
  });
  it("gives the aria-labels and the arm, leg and side words", () => {
    expect(hero).toMatch(/aria-label="12 kg, 10 reps per arm"/);
    expect(hero).toMatch(/"40 seconds per side"/);
    for (const w of ["per arm", "per leg", "per side"]) expect(hero).toContain(w);
  });
  it("says a non-flagged row is unchanged, same <p>, no extra row", () => {
    expect(hero).toMatch(/not flagged[^\n]*unchanged/i);
    expect(hero).toMatch(/same `<p>`/);
    expect(hero).toMatch(/no extra row/i);
  });
  it("covers offline and the null flag", () => {
    expect(hero).toMatch(/offline/i);
    expect(hero).toMatch(/null[^\n]*no label/i);
  });
});

describe("T-0973 AC2 contrast of --wl-ink-muted on lift and rest, and 320 px", () => {
  // lift and rest define no ink-muted key, so --wl-ink-muted resolves to ink.
  it("tokens: lift and rest have no ink-muted, so it is ink", () => {
    expect(c.lift["ink-muted"]).toBeUndefined();
    expect(c.rest["ink-muted"]).toBeUndefined();
  });
  const cases: Array<[string, string, string]> = [
    ["lift", c.lift.ink, c.lift.bg],
    ["lift deep", c.lift.ink, c.lift["bg-deep"]],
    ["rest", c.rest.ink, c.rest.bg],
  ];
  for (const [name, fg, bg] of cases) {
    it(`${name}: the stated ratio matches tokens.json and is at least 4.5`, () => {
      const r = ratio(fg, bg);
      expect(r).toBeGreaterThanOrEqual(4.5);
      const stated = r.toFixed(1);
      for (const doc of [hero, stepper]) expect(doc).toContain(`${stated}:1`);
    });
  }
  it("both specs state 320 px wrapping without truncation", () => {
    for (const doc of [hero, stepper]) {
      expect(doc).toMatch(/320 px/);
      expect(doc).toMatch(/never truncate/i);
    }
  });
});

describe("T-0973 AC3 UF-09.4 stepper", () => {
  it("names the group aria-label and the caption words", () => {
    for (const s of ["Reps per arm", "Reps per leg", "Reps per side", "Seconds per side"])
      expect(stepper).toContain(`"${s}"`);
    for (const s of ["per arm", "per leg", "per side", "seconds per side"])
      expect(stepper).toContain(`"${s}"`);
  });
  it("keeps the button names, pre-fill, RIR, 5 s auto-save, 44 px", () => {
    expect(stepper).toMatch(/"More reps" and "Less reps"[^\n]*unchanged/);
    expect(stepper).toMatch(/pre-fill, RIR and the 5 s auto-save are unchanged/i);
    expect(stepper).toMatch(/44 px/);
    expect(stepper).toMatch(/number alone/i);
  });
});

describe("T-0973 shared strings", () => {
  it("is the single source: formatReps, perSide and the callers", () => {
    expect(strings).toMatch(/`formatReps\(reps, unilateral, timed\)`/);
    expect(strings).toMatch(/`perSide\(word\)`/);
    for (const f of [
      "SummaryContent",
      "ListView",
      "current-set.tsx",
      "confirm-set.tsx",
      "stats.ts",
    ])
      expect(strings).toContain(f);
    expect(strings).toMatch(/no flow keeps its own copy/i);
    expect(strings).toMatch(/no new token/i);
  });
});

describe("T-0973 AC4 UF-03 and UF-06.2 formats with the 10, 10, 9 at 12 kg example", () => {
  for (const [name, doc] of [
    ["UF-03", hist03],
    ["UF-06.2", hist06],
  ] as const) {
    it(`${name}: weighted, bodyweight, example`, () => {
      expect(doc).toContain('"12 × 10 per arm"');
      expect(doc).toContain('"12 × 9 per arm"');
      expect(doc).toContain('"10 per arm"');
      expect(doc).toMatch(/10, 10, 9 at 12 kg/);
      expect(doc).toMatch(/not flagged[^\n]*unchanged/i);
      expect(doc).toMatch(/offline/i);
    });
  }
  it("UF-03: ListView and the grouped form", () => {
    expect(hist03).toContain('"Set 2 reps per arm"');
    expect(hist03).toContain('"3 × 10 per arm · 12 kg"');
    expect(hist03).toMatch(/only where a grouped (summary )?row already exists/i);
  });
  it("UF-06.2: Best set", () => {
    expect(hist06).toContain('"12 kg × 10 per arm"');
    expect(hist06).toMatch(/Est\. 1RM[^\n]*unchanged/i);
  });
});

describe("T-0973 AC5 UF-04.2 how-to", () => {
  it("has both texts, with the RIR sentence only on the non-timed one", () => {
    expect(howto).toContain(
      '"Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side."',
    );
    expect(howto).toContain('"Hold one side, then switch. Log seconds for one side."');
    expect(howto).toMatch(/timed[^\n]*no RIR sentence/i);
  });
  it("says a bilateral row has no extra line and the line is a static <p>", () => {
    expect(howto).toMatch(/bilateral row has no extra line/i);
    expect(howto).toMatch(/static[^\n]*`<p>`/);
  });
});

describe("T-0973 AC6 no colour or font defined in the new text", () => {
  it("adds no hex value and no font name", () => {
    for (const doc of [hero, stepper, strings, howto, hist06, hist03])
      expect(doc).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});
