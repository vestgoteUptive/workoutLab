// @vitest-environment node
// T-0418 AC-1: the rest bar and rest view hold no timer or tick-counting of their own (NFR-TIME-1,
// principle 3). The host re-renders every second and owns `ctx.rest`'s wall-clock maths; UF-03
// only reads it. A UF-03 copy of the T-0304a scan (`rest-tick-scan.ts`), because a test in
// `features/UF-03` may not deep-import `features/UF-09/__tests__` (D-0071 §4).
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ownTimerMatches, stripCommentsAndStrings, tickCountingMatches } from "./rest-tick-scan.js";

const FEATURE_DIR = resolve(__dirname, "..");
const read = (name: string) => readFileSync(resolve(FEATURE_DIR, name), "utf8");

function sourceFiles(): string[] {
  return readdirSync(FEATURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => e.name);
}

describe("AC-1 no setInterval/setTimeout countdown in features/UF-03", () => {
  it("every UF-03 source file has no setInterval/setTimeout call", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) expect(ownTimerMatches(read(file)), file).toEqual([]);
  });

  it("every UF-03 source file has no tick-counting fragment", () => {
    for (const file of sourceFiles()) expect(tickCountingMatches(read(file)), file).toEqual([]);
  });

  it("CONTRAST: the scan is live", () => {
    expect(ownTimerMatches("const id = setInterval(tick, 1000);\n")).toEqual(["setInterval("]);
    expect(
      ownTimerMatches('// setTimeout(x, 1000) in a comment\nconst s = "setTimeout(";\n'),
    ).toEqual([]);
    expect(tickCountingMatches("const s = x - 60;\nremaining--;\n")).toEqual(["remaining--"]);
    expect(stripCommentsAndStrings("// 120\nconst s = 1;")).not.toMatch(/120/);
  });
});
