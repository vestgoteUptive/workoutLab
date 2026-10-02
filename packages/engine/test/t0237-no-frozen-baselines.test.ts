// T-0237 UF-08.2 UF-08.3 UF-05.1 UF-10.1 UF-11.1: the four remaining frozen engine baselines
// are retired (D-0096). The rescoped tests keep their inline invariants; nothing in the engine
// tests reads the files. The names are built from parts so this file never matches itself.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const NAMES = [
  ["t0204", "suggest"],
  ["t0205", "suggest"],
  ["t0219", "baseline"],
  ["t0226", "suggest"],
].map((parts) => ["pre", ...parts].join("-"));

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return tsFiles(p);
    return d.isFile() && p.endsWith(".ts") ? [p] : [];
  });
}

describe("T-0237 the frozen engine baselines are gone", () => {
  it("T-0237 AC3 none of the four baseline fixtures exists under test/fixtures", () => {
    expect(NAMES).toHaveLength(4);
    const present = NAMES.filter((n) => existsSync(path.join(TEST_DIR, "fixtures", `${n}.json`)));
    expect(present).toEqual([]);
  });

  it("T-0237 AC3 no engine test file references any of the four baselines", () => {
    const files = tsFiles(TEST_DIR).filter((f) => f !== THIS_FILE);
    expect(files.length).toBeGreaterThan(30);
    const offenders = files.flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return NAMES.filter((n) => text.includes(n)).map(
        (n) => `${path.relative(TEST_DIR, f)}: ${n}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
