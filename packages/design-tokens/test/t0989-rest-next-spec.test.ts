// T-0989 (D-0273, D-0261, D-0263, D-0208): the UF-09.5 "Next" block is specified as text.
// Checked as text, like t0973.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pkgRoot, repoRoot } from "./helpers";

const screens = resolve(repoRoot, "Design-docs/docs/design/screens");
const spec = readFileSync(resolve(screens, "UF-09.5.md"), "utf8");
const uf09 = readFileSync(resolve(screens, "UF-09.3-UF-09.4.md"), "utf8");
const tokens = JSON.parse(readFileSync(resolve(pkgRoot, "src/tokens.json"), "utf8"));
const c = tokens.color;

function ratio(a: string, b: string): number {
  const lum = (h: string) => {
    const ch = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** True when a table row has a first cell and a later cell matching the given regexes. */
const hasRow = (first: RegExp, ...rest: RegExp[]) =>
  spec.split("\n").some((l) => {
    if (!l.startsWith("|")) return false;
    const p = l
      .split("|")
      .slice(1, -1)
      .map((x) => x.trim());
    return first.test(p[0]!) && rest.every((re) => p.slice(1).some((x) => re.test(x)));
  });

describe("T-0989 AC1 the four lines", () => {
  it("gives order, role, colour and wrapping for caption, name, load and cue", () => {
    expect(hasRow(/^1$/, /^Caption$/, /label role/, /--wl-ink/, /wraps/)).toBe(true);
    expect(hasRow(/^2$/, /^Exercise name$/, /1\.5rem[^|]*700/, /never truncated/)).toBe(true);
    expect(hasRow(/^3a$/, /^Load line$/, /stat role/, /wraps/)).toBe(true);
    expect(hasRow(/^3b$/, /^Cue$/, /body role/, /--wl-ink/, /wraps/)).toBe(true);
  });
  it("states the hierarchy and that no token, role or font is new", () => {
    expect(spec).toMatch(
      /timer \(hero number\) > load \(stat\) > name \(1\.5rem\) > caption and cue/,
    );
    expect(spec).toMatch(/\*\*No new token, role or font is used\.\*\*/);
  });
});

describe("T-0989 AC2 contrast and 320 px / 200 % zoom", () => {
  const cases: Array<[string, string, string]> = [
    ["rest bg", c.rest.ink, c.rest.bg],
    ["lift bg", c.rest.ink, c.lift.bg],
    ["lift bg-deep", c.rest.ink, c.lift["bg-deep"]],
  ];
  for (const [name, fg, bg] of cases) {
    it(`${name}: the stated ratio matches tokens.json and is at least 4.5`, () => {
      const r = ratio(fg, bg);
      expect(r).toBeGreaterThanOrEqual(4.5);
      expect(spec).toContain(`${r.toFixed(1)}:1`);
    });
  }
  it("rest has no ink-muted key", () => {
    expect(c.rest["ink-muted"]).toBeUndefined();
  });
  it("says every line wraps with no truncation, Skip rest reachable", () => {
    expect(spec).toMatch(/320 px and 200 % zoom/);
    expect(spec).toMatch(/No `text-overflow`, no `line-clamp`, no fixed height, no truncation/);
    expect(spec).toMatch(/\*\*Skip rest stays reachable\*\*/);
    expect(spec).toMatch(/320 × 568/);
  });
});

describe("T-0989 AC3 copy", () => {
  it("has flagged and not flagged load lines and the hidden reading", () => {
    expect(hasRow(/^Load, not flagged$/, /^"27,5 kg × 10"$/)).toBe(true);
    expect(hasRow(/^Load, flagged$/, /^"27,5 kg × 10 per arm"/)).toBe(true);
    expect(hasRow(/hidden reading/, /^"27,5 kg, 10 reps per arm"/)).toBe(true);
  });
  it("has bodyweight and Set weight variants", () => {
    expect(hasRow(/^Bodyweight, not flagged$/, /^"10 reps"$/)).toBe(true);
    expect(hasRow(/^Bodyweight, flagged$/, /^"10 reps per arm"$/)).toBe(true);
    expect(hasRow(/Set weight/, /"Set weight" over/)).toBe(true);
  });
  it("names per-side.ts as the only source", () => {
    expect(spec).toMatch(/\*\*only from `apps\/web\/src\/lib\/i18n\/per-side\.ts`\*\*/);
  });
});

describe("T-0989 AC4 states", () => {
  it("covers every state", () => {
    for (const s of [
      /^Same exercise next$/,
      /^New exercise next$/,
      /^Last set, nothing next$/,
      /^One-side, flagged$/,
      /^One-side, not flagged$/,
      /^Cue present$/,
      /^Cue absent$/,
      /^Timed$/,
      /^Offline$/,
      /^10 days off$/,
      /^Zero history$/,
      /^At 0 \(GO\)$/,
    ])
      expect(hasRow(s)).toBe(true);
  });
  it("states the binary pairs", () => {
    expect(spec).toMatch(/Binary pairs, all stated/);
  });
});

describe("T-0989 AC5 UF-09.3-UF-09.4 pointer", () => {
  it("no longer says the rest state shows no flagged label, and points to UF-09.5.md", () => {
    expect(uf09).not.toMatch(/rest state shows no flagged label/);
    expect(uf09).toContain("`UF-09.5.md`");
  });
});

describe("T-0989 AC6 no hex colour", () => {
  it("adds no hex value", () => {
    expect(spec).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});
