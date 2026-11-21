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

/** A markdown table row whose cells match the given regexes, in order (row-anchored). */
function row(doc: string, ...cells: RegExp[]): boolean {
  return doc.split("\n").some((l) => {
    if (!l.startsWith("|")) return false;
    const parts = l
      .split("|")
      .slice(1, -1)
      .map((x) => x.trim());
    return parts.length === cells.length && cells.every((re, i) => re.test(parts[i]!));
  });
}
const q = (t: string) => new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
const rowOf = (doc: string, ...cells: string[]) => row(doc, ...cells.map(q));

describe("T-0973 AC1 UF-09.3 hero lines and screen-reader text", () => {
  it("gives weighted, bodyweight and timed rows", () => {
    expect(
      rowOf(
        hero,
        "Weighted, flagged",
        '"12 kg" over "× 10" + span " per arm"',
        '"12 kg, 10 reps per arm"',
      ),
    ).toBe(true);
    expect(
      rowOf(hero, "Bodyweight or no weight, flagged", '"10 reps per arm"', '"10 reps per arm"'),
    ).toBe(true);
    expect(
      rowOf(hero, "Timed, flagged (timed-set.tsx)", '"Hold 0:40 per side"', '"Hold 0:40 per side"'),
    ).toBe(true);
    expect(row(hero, /^Not flagged$/, /as today/, /^as today$/)).toBe(true);
  });
  it("uses a nested unit span and a hidden span, not an aria-label", () => {
    expect(hero).toMatch(/nested `<span>`[^\n]*`\.wl-uf09__unit`/);
    expect(hero).toMatch(/no `aria-label`/);
    expect(hero).toMatch(/visually-hidden span/);
    expect(hero).toMatch(/new work/);
    expect(hero).not.toMatch(/aria-label="12 kg/);
  });
  it("timed: suffix after the hold target, no stepper, edited in ListView", () => {
    expect(hero).toMatch(/`holdTarget` plus `perSide`/);
    expect(hero).toMatch(/no stepper for timed holds/);
    expect(hero).toContain('"Set 2 seconds per side"');
  });
  it("says a non-flagged row is unchanged, no extra row, offline, null", () => {
    expect(hero).toMatch(/Not flagged: the row is unchanged/);
    expect(hero).toMatch(/no new row/i);
    expect(hero).toMatch(/offline/i);
    expect(hero).toMatch(/null[^\n]*no label/i);
    for (const w of ["per arm", "per leg", "per side"]) expect(hero).toContain(w);
  });
  it("orders the hero before the hold_effort line and covers both additions", () => {
    expect(uf09).toMatch(
      /Order on UF-09\.3:\*\* the hero \(including the suffix\), then the `hold_effort` line/,
    );
    expect(uf09).not.toMatch(/the only change in focus mode/);
  });
});

describe("T-0973 AC2 contrast of --wl-ink-muted on lift, and 320 px", () => {
  // lift and rest define no ink-muted key, so --wl-ink-muted resolves to the same white as ink.
  it("tokens: lift and rest have no ink-muted, and the docs say it equals ink", () => {
    expect(c.lift["ink-muted"]).toBeUndefined();
    expect(c.rest["ink-muted"]).toBeUndefined();
    expect(c.lift.ink).toBe("#FFFFFF");
    expect(hero).toMatch(/same white as `--wl-ink`[^\n]*no visual distinction/);
    expect(hero).not.toMatch(/rest `bg`/);
  });
  const cases: Array<[string, string, string]> = [
    ["lift", c.lift.ink, c.lift.bg],
    ["lift deep", c.lift.ink, c.lift["bg-deep"]],
  ];
  for (const [name, fg, bg] of cases) {
    it(`${name}: the stated ratio matches tokens.json and is at least 4.5`, () => {
      const r = ratio(fg, bg);
      expect(r).toBeGreaterThanOrEqual(4.5);
      for (const doc of [hero, stepper]) expect(doc).toContain(`${r.toFixed(1)}:1`);
    });
  }
  it("both specs state 320 px wrapping without truncation", () => {
    for (const doc of [hero, stepper]) {
      expect(doc).toMatch(/320 px/);
      expect(doc).toMatch(/never truncates/i);
    }
  });
});

describe("T-0973 AC3 UF-09.4 stepper", () => {
  it("names the group aria-label and the caption words", () => {
    for (const s of ["Reps per arm", "Reps per leg", "Reps per side"])
      expect(stepper).toContain(`"${s}"`);
    for (const s of ["per arm", "per leg", "per side"]) expect(stepper).toContain(`"${s}"`);
    expect(stepper).toMatch(/no stepper for timed holds/);
  });
  it("keeps the button names, pre-fill, RIR, 5 s auto-save, 44 px", () => {
    expect(stepper).toMatch(/"More reps" and "Less reps" stay unchanged/);
    expect(stepper).toMatch(/pre-fill, RIR and the 5 s auto-save are unchanged/i);
    expect(stepper).toMatch(/44 px/);
    expect(stepper).toMatch(/number alone/i);
  });
});

describe("T-0973 shared strings", () => {
  it("fixes the module path and signatures", () => {
    expect(strings).toContain("`apps/web/src/lib/i18n/per-side.ts`");
    expect(strings).toMatch(/`perSide\(word: "arm" \| "leg" \| "side"\): string`[^\n]*" per arm"/);
    expect(strings).toMatch(
      /`formatReps\(n: number, word: Word \| null, opts: \{ timed\?: boolean; locale: string \}\): string`/,
    );
  });
  it("has the row-by-row table", () => {
    const t = (call: string, res: string) => rowOf(strings, call, res);
    expect(t('`formatReps(10, "arm", { locale })`', '"10 reps per arm"')).toBe(true);
    expect(t('`formatReps(1, "arm", { locale })`', '"1 rep per arm"')).toBe(true);
    expect(t('`formatReps(40, "side", { timed: true, locale })`', '"40 s per side"')).toBe(true);
    expect(t("`formatReps(10, null, { locale })`", '"10 reps" (today)')).toBe(true);
    expect(t("`formatReps(40, null, { timed: true, locale })`", '"40 s" (today)')).toBe(true);
  });
  it("lists every caller and no flow copy", () => {
    const called = /Called by:[^\n]*/.exec(strings)![0];
    for (const f of [
      "SummaryContent",
      "ListView",
      "Today.tsx",
      "current-set.tsx",
      "confirm-set.tsx",
      "timed-set.tsx",
      "stats.ts",
    ])
      expect(called).toContain(f);
    expect(strings).toMatch(/No flow keeps its own copy/i);
    expect(strings).toMatch(/No new token/i);
    expect(strings).toMatch(/UF-02[^\n]*T-0975/);
  });
});

describe("T-0973 AC4 UF-03 and UF-06.2 formats with the 10, 10, 9 at 12 kg example", () => {
  for (const [name, doc] of [
    ["UF-03", hist03],
    ["UF-06.2", hist06],
  ] as const) {
    it(`${name}: example and unchanged, offline`, () => {
      expect(doc).toMatch(/10, 10, 9 at 12 kg/);
      expect(doc).toContain('"12 × 9 per arm"');
      expect(doc).toMatch(/not flagged[^\n]*unchanged/i);
      expect(doc).toMatch(/offline/i);
    });
  }
  it("UF-03 rows", () => {
    const r = (a: string, b: string, c2: string) => row(hist03, q(a), q(b), q(c2));
    expect(r("Set row, weighted", '"{weight} × {reps} per arm"', '"12 × 10 per arm"')).toBe(true);
    expect(r("Set row, bodyweight", '"{reps} per arm"', '"10 per arm"')).toBe(true);
    expect(
      r(
        "ListView reps input (aria-label only, no visible suffix)",
        '"Set {n} reps per arm"',
        '"Set 2 reps per arm"',
      ),
    ).toBe(true);
    expect(
      r(
        "ListView seconds input (aria-label only)",
        '"Set {n} seconds per side"',
        '"Set 2 seconds per side"',
      ),
    ).toBe(true);
    expect(
      r(
        "ListView previous session, `previousLoad`",
        '"{kg} × {reps} per arm"',
        '"97.5 × 8 per arm"',
      ),
    ).toBe(true);
    expect(
      r("ListView previous session, `previousReps`", '"{reps} reps per arm"', '"8 reps per arm"'),
    ).toBe(true);
    expect(
      r("ListView previous session, `previousSeconds`", '"{s} s per side"', '"40 s per side"'),
    ).toBe(true);
    expect(
      r(
        "PR line, `prWeighted`",
        '"{name} {weight} × {reps} per arm"',
        '"Dumbbell Row 12 kg × 10 per arm"',
      ),
    ).toBe(true);
    expect(
      r("PR line, `prReps`", '"{name} {reps} reps per arm"', '"Push-up 25 reps per arm"'),
    ).toBe(true);
    expect(r("PR line, `prTimed`", '"{name} {s} s per side"', '"Side plank 40 s per side"')).toBe(
      true,
    );
  });
  it("UF-03: no grouped row, no visible suffix on inputs", () => {
    expect(hist03).toMatch(/No grouped summary row/);
    expect(hist03).toMatch(/form is not used/);
    expect(hist03).toMatch(/change their aria-label only/);
  });
  it("UF-06.2 rows", () => {
    const r = (a: string, b: string, c2: string) => row(hist06, q(a), q(b), q(c2));
    expect(
      r("Best set card, `weightedBest`", '"{weight} kg × {reps} per arm"', '"12 kg × 10 per arm"'),
    ).toBe(true);
    expect(r("Best set card, `repsBest`", '"{reps} reps per arm"', '"10 reps per arm"')).toBe(true);
    expect(r("Best set card, timed", '"{s} s per side"', '"40 s per side"')).toBe(true);
    expect(hist06).toMatch(/Best set table column[^\n]*same helper/);
    expect(hist06).toMatch(/Est\. 1RM[^\n]*unchanged/);
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
  it("adds no hex value", () => {
    for (const doc of [hero, stepper, strings, howto, hist06, hist03])
      expect(doc).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});
