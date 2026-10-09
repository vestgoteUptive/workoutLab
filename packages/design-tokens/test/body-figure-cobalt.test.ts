// T-0614 (D-0208, D-0211 §2/§5, UF-02.1 / UF-10.1 / UF-04.2): the body figure and C-01 on
// Cobalt. AC1 the design-system.md table names generic variables only, AC3 the contrast pairs,
// AC4 check-figure accepts both preview sections and catches planted faults in the Cobalt one.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import { contrast, repoRoot } from "./helpers";

const designDir = resolve(repoRoot, "Design-docs/docs/design");
const figureDir = resolve(designDir, "assets/body-figure");
const checker = resolve(figureDir, "check-figure.mjs");
const md = readFileSync(resolve(designDir, "design-system.md"), "utf8");
const preview = readFileSync(resolve(figureDir, "preview.html"), "utf8");
const plan = raw.color.plan;

const CHALK = /\b(?:surface-2|surface|accent|warn|text-muted|line-strong|on-accent|text)\b/;

/** Throws unless the "## Body figure" table's Fill and Stroke cells name only `--wl-` variables. */
function checkFigureTable(text: string): void {
  const section = text.split(/^## /m).find((s) => s.startsWith("Body figure"));
  expect(section, "Body figure section").toBeDefined();
  const lines = (section as string).split("\n");
  const head = lines.findIndex((l) => l.startsWith("| Part (class) | Fill | Stroke |"));
  expect(head, "Part / Fill / Stroke table").toBeGreaterThanOrEqual(0);
  const rows = lines.slice(head + 2).filter((l) => l.startsWith("|"));
  const end = lines.slice(head + 2).findIndex((l) => !l.startsWith("|"));
  const body = end < 0 ? rows : rows.slice(0, end);
  expect(body.length, "table rows").toBeGreaterThanOrEqual(6);
  for (const row of body) {
    const [, , fill, stroke] = row.split("|").map((c) => c.trim());
    for (const cell of [fill, stroke] as string[]) {
      for (const m of cell.matchAll(/`([^`]+)`/g))
        expect(m[1], `${row}: names ${m[1]}`).toMatch(/^--wl-[a-z0-9-]+(?:-N)?$/);
      expect(cell.replace(/`[^`]+`/g, ""), `${row}: Chalk & Iron name`).not.toMatch(CHALK);
    }
  }
}

describe("T-0614 AC1 design-system.md body-figure table uses generic variables only", () => {
  it("every Fill and Stroke cell names a --wl- variable and no Chalk & Iron name", () => {
    checkFigureTable(md);
  });
  it("names each variable the ticket lists, and forced colours unchanged", () => {
    const section = md.split(/^## /m).find((s) => s.startsWith("Body figure")) as string;
    for (const v of [
      "`--wl-raise` | 1.5 px `--wl-ink-muted`",
      "`--wl-coverage-N`",
      "`--wl-ink` primary or the `--wl-ink` hatch secondary",
      "0.75 px `--wl-line`",
      "the 1 px region border, then a 1 px `--wl-bg` gap, then 2 px `--wl-attention`",
      "2 px `--wl-focus`",
      "Forced colours:** unchanged",
    ])
      expect(section, v).toContain(v);
    expect(section).not.toMatch(/`(?:surface-2|accent|warn|text-muted)`/);
  });
  it("planted fault: an `accent` row fails", () => {
    const faulty = md.replace(
      "| Body outline (`wl-fig__body wl-fig__silhouette`)",
      "| Primary (`wl-fig__region--primary`) | `accent` | none |\n| Body outline (`wl-fig__body wl-fig__silhouette`)",
    );
    expect(faulty).not.toBe(md);
    expect(() => checkFigureTable(faulty)).toThrow(/names accent/);
  });
  it("documents the contrast table with the ticket's values", () => {
    for (const [pair, ratio] of [
      ["`plan.ink-muted` on `plan.raise`", "4.2"],
      ["`plan.ink` (white) on `plan.raise`", "6.2"],
      ["`plan.attention` on `plan.bg`", "5.0"],
      ["`plan.attention` on white", "1.7"],
    ])
      expect(md, pair).toContain(`| ${pair} | ${ratio} |`);
  });
});

describe("T-0614 AC3 contrast (WCAG 2.2 AA non-text 3:1)", () => {
  it.each([
    [
      "plan.ink-muted on plan.raise (silhouette and region borders)",
      plan["ink-muted"],
      plan.raise,
      4.2,
    ],
    ["plan.ink on plan.raise (primary, hatch, step 4)", plan.ink, plan.raise, 6.2],
    ["plan.attention on plan.bg (the halo next to the gap)", plan.attention, plan.bg, 5.0],
    ["plan.attention on plan.raise (the halo across the body)", plan.attention, plan.raise, 3.6],
    ["plan.ink on plan.bg (the highlight ring)", plan.ink, plan.bg, 8.6],
  ] as const)("%s ≥ 3 (documented %s)", (_name, fg, bg, documented) => {
    const r = contrast(fg, bg);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(Math.round(r * 10) / 10).toBe(documented);
  });
  it("plan.attention on #FFFFFF stays under 3 (1.7): the reason for the plan.bg gap", () => {
    const r = contrast(plan.attention, "#FFFFFF");
    expect(r).toBeLessThan(3);
    expect(Math.round(r * 10) / 10).toBe(1.7);
  });
});

function check(args: string[], input?: string) {
  const r = spawnSync(process.execPath, [checker, ...args], { encoding: "utf8", input });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const checkPreview = (text: string) => check(["--preview", "-"], text);

/** Replace exactly one occurrence, so a fault is never planted by accident elsewhere. */
function plant(from: string | RegExp, to: string): string {
  const out = preview.replace(from, to);
  expect(out, `fault ${String(from)} was planted`).not.toBe(preview);
  return out;
}

describe("T-0614 AC4 check-figure accepts both preview sections", () => {
  it("the shipped preview passes", () => {
    const r = checkPreview(preview);
    expect(r.out).toContain("check-figure: ok");
    expect(r.status).toBe(0);
  });
  it("the Cobalt section has steps 0 and 4, attention on and off, primary, secondary and a ring", () => {
    const cobalt = /<section[^>]*data-preview="cobalt"[^>]*>([\s\S]*?)<\/section>/.exec(
      preview,
    )?.[1];
    expect(cobalt).toBeDefined();
    for (const s of [
      'data-cov="all:0"',
      'data-cov="all:4"',
      "data-attention=",
      "data-primary=",
      "data-secondary=",
      "data-ring=",
    ])
      expect(cobalt, s).toContain(s);
    expect(cobalt).toContain("The same steps, attention off.");
  });

  const cases: [string, string, RegExp][] = [
    [
      "a Cobalt rule reading a flat token",
      plant(
        /(\[data-wl-state="plan"\] \.wl-fig__region--primary \{\n\s*fill: )var\(--wl-ink\)/,
        "$1var(--wl-color-accent)",
      ),
      /Cobalt rule reads --wl-color-accent/,
    ],
    [
      "a Cobalt rule reading a plan token directly",
      plant(
        /(\.wl-fig__halo-warn \{\n\s*fill: none;\n\s*stroke: )var\(--wl-attention\)(;\n\s*stroke-width: 7px;\n\s*\}\n\s*\[data-wl-state)/,
        "$1var(--wl-color-plan-attention)$2",
      ),
      /Cobalt rule reads --wl-color-plan-attention/,
    ],
    [
      "an unscoped Cobalt rule",
      plant(/\[data-wl-state="plan"\] (\.wl-fig__hatch-stripe \{)/, "$1"),
      /Cobalt rule "\.wl-fig__hatch-stripe" is not under/,
    ],
    [
      "a plan mapping to a legacy token",
      plant("--wl-raise: var(--wl-color-plan-raise);", "--wl-raise: var(--wl-color-surface-2);"),
      /plan mapping --wl-raise reads --wl-color-surface-2/,
    ],
    [
      "a raw colour",
      plant("--wl-ink: var(--wl-color-plan-ink);", "--wl-ink: #FFFFFF;"),
      /colour literal "#FFFFFF"/,
    ],
    [
      "no step 4 demo in the Cobalt section",
      plant('data-cov="all:4"><p>Step 4', 'data-cov="all:3"><p>Step 4'),
      /cobalt section has no C-01 step 4 demo/,
    ],
    [
      "no attention-off demo",
      plant(
        /(data-cov="[^"]*glutes:4[^"]*")(\s*>\s*<p>The same steps)/,
        '$1 data-attention="core"$2',
      ),
      /cobalt section has no attention off demo/,
    ],
    [
      "no secondary in the Cobalt section",
      plant(
        /<section class="cobalt"[\s\S]*?<\/section>/,
        preview
          .match(/<section class="cobalt"[\s\S]*?<\/section>/)![0]
          .replaceAll("data-secondary=", "data-x="),
      ),
      /cobalt section has no UF-04\.2 secondary demo/,
    ],
    [
      "the legacy section removed",
      plant('<section data-preview="legacy">', "<section>"),
      /no <section data-preview="legacy">/,
    ],
    [
      "the legacy rules removed",
      plant('<style id="wl-fig-css">', "<style>"),
      /<style id="wl-fig-css"> is missing/,
    ],
  ];
  it.each(cases)("planted fault: %s", (_name, text, message) => {
    const r = checkPreview(text);
    expect(r.out).toMatch(message);
    expect(r.status).toBe(1);
  });
});
