// T-0972 AC5 (D-0262): the engine stays unaware of the one-side flag. Neither the engine source
// nor the vendored engine copy for Edge Functions mentions it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist") return [];
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("T-0972 AC5: engine unaware of unilateral", () => {
  for (const rel of ["packages/engine", "supabase/functions/_shared/vendor/engine"]) {
    it(`${rel} has no 'unilateral'`, () => {
      const hits = files(path.join(ROOT, rel)).filter((f) =>
        /unilateral/i.test(readFileSync(f, "utf8")),
      );
      expect(hits).toEqual([]);
    });
  }
  it("the search sees files (not vacuous)", () => {
    expect(files(path.join(ROOT, "packages/engine")).length).toBeGreaterThan(5);
  });
});
