// T-0625 AC5 (D-0210 §6): nothing in apps/**, infra/** or .github/** reads a retired Chalk & Iron
// key: the flat colour keys (as CSS variables or as tokens.json reads), font.display / font.body,
// meta.coverage and radius.segment. Test files are skipped: they may name a key to pin that it is
// gone. Font family names in hand-written HTML (auth emails) are not token reads.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./helpers";

const FLAT =
  "bg|bg-focus|surface|surface-2|line|line-strong|text|text-muted|accent|accent-hover|warn|on-accent|coverage-[0-4]";
const RETIRED = new RegExp(
  [
    `--wl-color-(?:${FLAT})(?![\\w-])`,
    "--wl-color-coverage-\\$\\{",
    "--wl-font-(?:display|body)\\b",
    "--wl-radius-segment\\b",
    `\\bcolor\\.(?:${FLAT.replace("coverage-[0-4]", "_none_")})(?![\\w-])`,
    `\\bcolor\\[["'](?:${FLAT})["']\\]`,
    "\\bfont\\.(?:display|body)\\b",
    "\\bmeta\\.coverage\\b",
    "\\bradius\\.segment\\b",
    "\\bradius\\[[\"']segment[\"']\\]",
  ].join("|"),
);
const ROOTS = ["apps", "infra", ".github"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".turbo",
  "__tests__",
  "__e2e__",
  "test",
  "browser",
  "coverage",
  "playwright-report",
  "test-results",
]);
const CODE = /\.(?:ts|tsx|js|mjs|cjs|css|astro|html|json|ya?ml|tf|sh)$/;
const TEST_FILE = /\.(?:test|spec)\.[a-z]+$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else if (CODE.test(name) && !TEST_FILE.test(name)) out.push(p);
  }
  return out;
}

/** `file:line: text` for every line that reads a retired key. */
export function retiredReads(files: { path: string; text: string }[]): string[] {
  return files.flatMap(({ path, text }) =>
    text
      .split("\n")
      .flatMap((line, i) => (RETIRED.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : [])),
  );
}

describe("T-0625 AC5 no read of a retired key in apps/**, infra/**, .github/**", () => {
  const files = ROOTS.flatMap((r) => walk(join(repoRoot, r))).map((p) => ({
    path: relative(repoRoot, p),
    text: readFileSync(p, "utf8"),
  }));

  it("the scan covers the three trees", () => {
    for (const r of ROOTS)
      expect(
        files.some((f) => f.path.startsWith(`${r}/`)),
        r,
      ).toBe(true);
    expect(files.length).toBeGreaterThan(100);
  });
  it("finds no retired key", () => {
    expect(retiredReads(files)).toEqual([]);
  });
  it("planted fault: each kind of retired read is caught", () => {
    for (const line of [
      "  return state ?? tokens.color.bg;",
      'const s = TOKENS.color["surface-2"];',
      "color: var(--wl-color-accent);",
      "background: var(--wl-color-coverage-4);",
      "`var(--wl-color-coverage-${step})`",
      "font-family: var(--wl-font-body);",
      "border-radius: var(--wl-radius-segment);",
      "const f = tokens.font.display.family;",
      "raw.meta.coverage[0]",
      "tokens.radius.segment",
    ])
      expect(retiredReads([{ path: "x.ts", text: line }]), line).toHaveLength(1);
  });
  it("the state reads and font names are not flagged", () => {
    for (const line of [
      "tokens.color.plan.bg",
      "var(--wl-color-plan-line)",
      "var(--wl-color-plan-coverage-4)",
      "var(--wl-color-lift-bg-deep)",
      "raw.meta.planCoverage",
      "var(--wl-radius-progress)",
      "font-family: 'DM Sans', Arial, sans-serif",
      "var(--wl-bg)",
    ])
      expect(retiredReads([{ path: "x.ts", text: line }]), line).toEqual([]);
  });
});
