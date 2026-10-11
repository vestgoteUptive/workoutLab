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

describe("T-0660 check-figure accepts the v2 preview and its CSS (replaces T-0614 AC4)", () => {
  it("the shipped preview passes", () => {
    const r = checkPreview(preview);
    expect(r.out).toContain("check-figure: ok");
    expect(r.status).toBe(0);
  });
  it("the v2 section has coverage with attention, primary, secondary, ring, compact, lift and rest", () => {
    const v2 = /<section[^>]*data-preview="v2"[^>]*>([\s\S]*?)<\/section>/.exec(preview)?.[1];
    expect(v2).toBeDefined();
    for (const x of [
      "data-attention=",
      "data-primary=",
      "data-secondary=",
      "data-ring=",
      'data-size="compact"',
      'data-wl-state="lift"',
      'data-wl-state="rest"',
    ])
      expect(v2, x).toContain(x);
  });

  const cases: [string, string, RegExp][] = [
    [
      "a raw colour in the state mapping",
      plant("--wl-ink: var(--wl-color-plan-ink);", "--wl-ink: #FFFFFF;"),
      /colour literal "#FFFFFF"/,
    ],
    [
      "a state mapping reading a flat Chalk token",
      plant("--wl-ink: var(--wl-color-plan-ink);", "--wl-ink: var(--wl-color-accent);"),
      /state mapping reads --wl-color-accent/,
    ],
    [
      "the component CSS link removed",
      plant("components/body-figure/body-figure.css", "components/body-figure/other.css"),
      /doesn't link components\/body-figure\/body-figure\.css/,
    ],
    [
      "a private copy of the figure rules",
      plant(
        '<style id="wl-state-vars">',
        '<style id="wl-fig-css">.x{}</style><style id="wl-state-vars">',
      ),
      /carries its own copy of the figure rules/,
    ],
    [
      "no highlight demo",
      plant(/data-ring="[^"]*"/, 'data-x="1"'),
      /v2 section has no highlight ring demo/,
    ],
    [
      "no compact demo",
      plant('data-size="compact"', 'data-size="detail"'),
      /v2 section has no compact size demo/,
    ],
    [
      "the rest state demo removed",
      plant(/(<div class="demo" )data-wl-state="rest"/, '$1data-wl-state="plan"'),
      /v2 section has no rest state demo/,
    ],
    [
      "a superseded variants section left in",
      plant(
        '<section data-preview="v2">',
        '<section data-preview="variants"></section><section data-preview="v2">',
      ),
      /superseded v1 or variants section/,
    ],
  ];
  it.each(cases)("planted fault: %s", (_name, text, message) => {
    const r = checkPreview(text);
    expect(r.out).toMatch(message);
    expect(r.status).toBe(1);
  });

  it("planted fault: a raw colour in the figure CSS is caught", () => {
    const css = readFileSync(
      resolve(repoRoot, "apps/web/src/components/body-figure/body-figure.css"),
      "utf8",
    );
    const bad = css.replace("fill: var(--wl-fig-base);", "fill: #ffffff;");
    expect(bad).not.toBe(css);
    // checkCss is exported; run it through a tiny inline script.
    const r = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { checkCss } from ${JSON.stringify(checker)}; console.log(JSON.stringify(checkCss(process.argv[1])));`,
        bad,
      ],
      { encoding: "utf8" },
    );
    expect(r.stdout).toContain("colour literal");
    const ok = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { checkCss } from ${JSON.stringify(checker)}; console.log(JSON.stringify(checkCss(process.argv[1])));`,
        css,
      ],
      { encoding: "utf8" },
    );
    expect(ok.stdout.trim()).toBe("[]");
  });
});
