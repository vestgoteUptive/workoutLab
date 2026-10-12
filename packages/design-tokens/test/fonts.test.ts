// T-0625 AC3 (D-0210 §6): the Chalk & Iron fonts are retired. packages/design-tokens/fonts holds
// exactly the two D-0208 state faces, their OFL texts and SOURCES.md, and fonts.css has exactly two
// @font-face blocks. The face rules themselves are checked in fonts-state.test.ts (T-0583 AC5).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import { pkgRoot } from "./helpers";

const fontsDir = resolve(pkgRoot, "fonts");
const EXPECTED = [
  "OFL-BricolageGrotesque.txt",
  "OFL-FamiljenGrotesk.txt",
  "SOURCES.md",
  "bricolage-grotesque-latin-wght.woff2",
  "familjen-grotesk-latin-wght.woff2",
];
const RETIRED = /Big Shoulders|DM Sans|big-shoulders|dm-sans|BigShoulders|DMSans/;

/** Throws unless `files` is exactly the state pair, its licences and SOURCES.md. */
function checkFontDir(files: string[]): void {
  expect([...files].sort(), "fonts/ contents").toEqual(EXPECTED);
}

/** Throws unless `css` has exactly two @font-face blocks and names no retired face. */
function checkFontsCss(css: string): void {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(stripped.match(/@font-face\s*\{/g) ?? [], "exactly 2 @font-face blocks").toHaveLength(2);
  expect(stripped, "no retired face").not.toMatch(RETIRED);
}

describe("T-0625 AC3 fonts/ and fonts.css hold the two state faces only", () => {
  it("fonts/ is exactly the two state woff2, their OFL texts and SOURCES.md", () => {
    checkFontDir(readdirSync(fontsDir));
  });
  it("fonts.css has exactly two @font-face blocks, no Big Shoulders or DM Sans", () => {
    checkFontsCss(readFileSync(resolve(pkgRoot, "src/fonts.css"), "utf8"));
  });
  it("there is no separate src/fonts-state.css any more (the export is an alias)", () => {
    expect(readdirSync(resolve(pkgRoot, "src"))).not.toContain("fonts-state.css");
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf8"));
    expect(pkg.exports["./fonts-state.css"]).toBe("./src/fonts.css");
    expect(pkg.exports["./fonts.css"]).toBe("./src/fonts.css");
  });
  it("SOURCES.md has no row for a retired file; tokens.font is exactly plan and session", () => {
    const sources = readFileSync(resolve(fontsDir, "SOURCES.md"), "utf8");
    for (const row of sources.split("\n").filter((l) => l.startsWith("|")))
      expect(row).not.toMatch(RETIRED);
    expect(Object.keys(raw.font)).toEqual(["plan", "session"]);
  });
  it("planted fault: a leftover legacy woff2 fails", () => {
    expect(() => checkFontDir([...EXPECTED, "dm-sans-latin-wght.woff2"])).toThrow(
      /fonts\/ contents/,
    );
  });
  it("planted fault: a third @font-face block fails", () => {
    const css = readFileSync(resolve(pkgRoot, "src/fonts.css"), "utf8");
    const faulty = `${css}\n@font-face { font-family: "DM Sans"; src: url("../fonts/dm-sans-latin-wght.woff2") format("woff2"); }\n`;
    expect(() => checkFontsCss(faulty)).toThrow(/exactly 2 @font-face/);
  });
});
