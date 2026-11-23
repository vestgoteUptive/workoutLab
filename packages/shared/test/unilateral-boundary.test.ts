// T-0972 AC5 (D-0262), flipped to an allow-list by T-0978a AC6 (D-0268 §3): only the engine's type
// and cost model (and their vendored counterparts) may mention the one-side flag.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const ALLOWED = new Set([
  "packages/engine/src/types.ts",
  "packages/engine/src/cost.ts",
  "supabase/functions/_shared/vendor/engine/types.d.ts",
  "supabase/functions/_shared/vendor/engine/cost.js",
  "supabase/functions/_shared/vendor/engine/cost.d.ts",
]);

/** Pure: the files (repo-relative path -> text) that mention the flag and are not allowed. */
export function scan(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([rel, text]) => !ALLOWED.has(rel) && /unilateral/i.test(text))
    .map(([rel]) => rel);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist") return [];
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const read = (rel: string) =>
  Object.fromEntries(
    files(path.join(ROOT, rel)).map((f) => [
      path.relative(ROOT, f).split(path.sep).join("/"),
      readFileSync(f, "utf8"),
    ]),
  );

const MENTION = "// unilateral";

describe("T-0978a AC6: the scanner", () => {
  it.each(["packages/engine/src/cost.ts", "packages/engine/src/types.ts"])(
    "T-0978a AC6 allows %s",
    (rel) => {
      expect(scan({ [rel]: MENTION })).toEqual([]);
    },
  );
  it.each([
    "packages/engine/src/session.ts",
    "packages/engine/src/balance.ts",
    "packages/engine/src/prefill.ts",
    "supabase/functions/_shared/vendor/engine/session.js",
  ])("T-0978a AC6 flags %s", (rel) => {
    expect(scan({ [rel]: MENTION })).toEqual([rel]);
  });
});

describe("T-0978a AC6: the real tree", () => {
  for (const rel of ["packages/engine", "supabase/functions/_shared/vendor/engine"]) {
    it(`T-0978a AC6 ${rel} mentions it only in the allow-list`, () => {
      const tree = read(rel);
      expect(Object.keys(tree).length).toBeGreaterThan(5);
      expect(scan(tree)).toEqual([]);
    });
  }
});
