// @vitest-environment node
// T-0304g AC-5 (NFR-A11Y-5, D-0119 §10): the CSS backstop. uf-09.css has a
// `@media (prefers-reduced-motion: reduce)` block that sets `transition: none` and
// `animation: none` on the ring fill class.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "..", "uf-09.css"), "utf8");

/** The bodies of every `@media (prefers-reduced-motion: reduce)` block (one nesting level). */
function reduceBlocks(source: string): string[] {
  const out: string[] = [];
  const re = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g;
  for (const m of source.matchAll(re)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    out.push(source.slice(start, i - 1));
  }
  return out;
}

/** The declarations of `selector`'s rules inside `block`. */
function declsFor(block: string, selector: string): string[] {
  return [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1]!.split(",").some((s) => s.trim() === selector))
    .map((m) => m[2]!);
}

function backstopOk(source: string): boolean {
  return reduceBlocks(source).some((block) =>
    declsFor(block, ".wl-uf09__ring-fill").some(
      (d) =>
        /(^|[;\s])transition\s*:\s*none\b/.test(d) && /(^|[;\s])animation\s*:\s*none\b/.test(d),
    ),
  );
}

describe("AC-5 the CSS backstop", () => {
  it("uf-09.css: a reduce block sets transition: none and animation: none on .wl-uf09__ring-fill", () => {
    expect(backstopOk(css)).toBe(true);
  });

  it("the check is live: a block with only one of the two, or on another class, fails", () => {
    const ring = ".wl-uf09__ring-fill";
    expect(
      backstopOk(`@media (prefers-reduced-motion: reduce) { ${ring} { transition: none; } }`),
    ).toBe(false);
    expect(
      backstopOk(
        `@media (prefers-reduced-motion: reduce) { .x { transition: none; animation: none; } }`,
      ),
    ).toBe(false);
    expect(backstopOk(`${ring} { transition: none; animation: none; }`)).toBe(false);
    expect(
      backstopOk(
        `@media (prefers-reduced-motion: reduce) { ${ring} { transition: none !important; animation: none !important; } }`,
      ),
    ).toBe(true);
  });
});
