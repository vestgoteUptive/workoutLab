// T-0624 AC1 (D-0210 §6): nothing in apps/web reads a flat Chalk & Iron colour key or the flat
// font variables; components read the generic --wl-* state variables. Test files are skipped:
// they may name a flat key to pin that it is gone.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../../..");
const FLAT =
  /--wl-color-(bg|bg-focus|surface|surface-2|line|line-strong|text|text-muted|accent|accent-hover|warn|on-accent|coverage-[0-4])\b|--wl-color-coverage-\$\{|--wl-font-(display|body)/;

/**
 * Known remaining reads in feature folders, which this ticket may not edit. Each entry is a
 * follow-up for that feature lane; delete the entry when the lane migrates it.
 */
const PENDING_FEATURE_FOLLOW_UPS = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "__e2e__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|css|mjs)$/.test(name) && !/\.test\.[a-z]+$/.test(name)) out.push(p);
  }
  return out;
}

export function flatReads(files: string[]): string[] {
  return files.flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .flatMap((line, i) =>
        FLAT.test(line) ? [`${relative(WEB, f)}:${i + 1}: ${line.trim()}`] : [],
      ),
  );
}

describe("T-0624 AC1 no flat legacy reads in apps/web", () => {
  const rootFiles = readdirSync(WEB)
    .filter((n) => /\.(ts|mjs)$/.test(n) && !/\.test\.[a-z]+$/.test(n))
    .map((n) => join(WEB, n));
  const files = [...walk(join(WEB, "src")), ...rootFiles];

  it("finds no flat colour key and no --wl-font-display/body", () => {
    expect(files.length).toBeGreaterThan(50);
    const hits = flatReads(files).filter(
      (h) => ![...PENDING_FEATURE_FOLLOW_UPS].some((f) => h.startsWith(`${f}:`)),
    );
    expect(hits).toEqual([]);
  });

  it("catches a planted use", () => {
    expect(FLAT.test("color: var(--wl-color-accent);")).toBe(true);
    expect(FLAT.test("font-family: var(--wl-font-body);")).toBe(true);
    expect(FLAT.test("`var(--wl-color-coverage-${step})`")).toBe(true);
    expect(FLAT.test("color: var(--wl-color-plan-ink);")).toBe(false);
  });
});
