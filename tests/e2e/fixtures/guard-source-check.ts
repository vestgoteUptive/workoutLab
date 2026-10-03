// T-0356 (D-0086, D-0090): the "every spec takes `test` from the guarded fixture" rule as pure
// functions, so `fixture-guard.spec.ts` can test them on planted strings and scratch directories
// and then run them over the real `tests/e2e/*.spec.ts`. The spec list is a glob, not a list, so a
// new spec can't opt out by importing `test` from `@playwright/test`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./source-rules.js";

// Anchored to a line start, so an import quoted inside a string (this repo's own planted
// sources) is not read as one.
const GUARDED_IMPORT =
  /^[ \t]*import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']\.\/fixtures\/guarded-test\.js["']/ms;
const PLAYWRIGHT_IMPORT =
  /^[ \t]*import\s+(type\s+)?([^;]*?)\s+from\s*["']@playwright\/test["']/gms;
const PLAYWRIGHT_REQUIRE = /require\(\s*["']@playwright\/test["']\s*\)/;
const BINDS_TEST = /(^|[\s,{])test([\s,}]|$)/;

/** `null` when the source takes `test` from the guarded fixture and binds none from Playwright. */
export function unguardedReason(source: string): string | null {
  const code = stripComments(source);
  const fromFixture = code.match(GUARDED_IMPORT);
  if (!fromFixture || !BINDS_TEST.test(fromFixture[1]!)) {
    return 'does not import `test` from "./fixtures/guarded-test.js"';
  }
  if (PLAYWRIGHT_REQUIRE.test(code)) return 'requires "@playwright/test" at runtime';
  for (const match of code.matchAll(PLAYWRIGHT_IMPORT)) {
    if (match[1]) continue; // `import type …` binds no value
    const clause = match[2]!;
    const named = clause.match(/\{([^}]*)\}/s)?.[1] ?? "";
    const valueNames = named
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !/^type\s/.test(part));
    const bindsTest = valueNames.some((part) => /^test(\s+as\s+\w+)?$/.test(part));
    const nonNamed = clause
      .replace(/\{[^}]*\}/s, "")
      .replace(/,/g, "")
      .trim();
    if (bindsTest) return 'binds `test` from "@playwright/test"';
    if (nonNamed) return 'default or namespace import from "@playwright/test"';
  }
  return null;
}

/** The `*.spec.ts` files directly in `dir`, sorted. Does not recurse. */
export function listSpecs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
    .map((entry) => entry.name)
    .sort();
}

export function unguardedSpecs(dir: string): Array<{ file: string; reason: string }> {
  const found: Array<{ file: string; reason: string }> = [];
  for (const file of listSpecs(dir)) {
    const reason = unguardedReason(readFileSync(join(dir, file), "utf8"));
    if (reason !== null) found.push({ file, reason });
  }
  return found;
}
