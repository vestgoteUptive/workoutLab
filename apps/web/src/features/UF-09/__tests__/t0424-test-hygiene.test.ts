// T-0424 AC-3 (UF-09.7): no UF-09 test detaches the DOM by clearing `document.body`. That leaves
// the React root mounted, so two hosts (two stores, two timer loops) run at once; tests unmount
// with `cleanup()` or the render's `unmount()` instead.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const SELF = "t0424-test-hygiene.test.ts";
// An assignment with or without spaces (`=`, ` = `), not a comparison (`==`, `===`). The escaped
// dots mean the regex source doesn't match itself.
const PATTERN = /document\.body\.innerHTML\s*=(?!=)/;

describe("T-0424 AC3 the UF-09 test hygiene guard", () => {
  const files = readdirSync(DIR)
    .filter((f) => /\.test\.tsx?$/.test(f) && f !== SELF)
    .sort();

  it("T-0424 AC3 reads more than 20 test files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("T-0424 AC3 no test file clears document.body.innerHTML", () => {
    const offenders = files.filter((f) => PATTERN.test(readFileSync(join(DIR, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
