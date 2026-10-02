// T-0236 UF-08.2 UF-09.3: the T-0220 AC6 frozen snapshot is retired (D-0131, D-0096). The
// sweep keeps its inline old-formula invariants; nothing in the engine tests reads the file.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const NAME = ["pre", "t0220", "suggest"].join("-");

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return tsFiles(p);
    return d.isFile() && p.endsWith(".ts") ? [p] : [];
  });
}

describe("T-0236 the T-0220 snapshot is gone", () => {
  it("T-0236 AC3 test/fixtures/pre-t0220-suggest.json does not exist", () => {
    expect(existsSync(path.join(TEST_DIR, "fixtures", `${NAME}.json`))).toBe(false);
  });

  it("T-0236 AC3 no engine test file references pre-t0220-suggest", () => {
    const files = tsFiles(TEST_DIR).filter((f) => f !== THIS_FILE);
    expect(files.length).toBeGreaterThan(30);
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes(NAME))
      .map((f) => path.relative(TEST_DIR, f));
    expect(offenders).toEqual([]);
  });
});
