// T-0544 (D-0203 §1, spec docs/specs/visual-foundation.md §1): self-hosted variable latin woff2.
// F-1 = fonts.css shape (AC1, AC2), F-2 = files, budget, licences, sha256 (AC3, AC4), AC5 = exports.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import { pkgRoot } from "./helpers";

const fontsDir = resolve(pkgRoot, "fonts");
const cssPath = resolve(pkgRoot, "src/fonts.css");
const sourcesPath = resolve(fontsDir, "SOURCES.md");

const WOFF2 = {
  display: "big-shoulders-display-latin-wght.woff2",
  body: "dm-sans-latin-wght.woff2",
} as const;
const MAX_EACH = 61_440;
const MAX_TOTAL = 112_640;

/** First family of a tokens.json stack, unquoted. */
function firstFamily(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "");
}

function blocks(css: string): string[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
}

function prop(block: string, name: string): string[] {
  const re = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`, "g");
  return [...block.matchAll(re)].map((m) => (m[1] ?? "").replace(/\s+/g, " ").trim());
}

/** AC1: throws (vitest assertion) when fonts.css doesn't match the spec / tokens.json. */
function checkFontsCss(css: string): void {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(stripped, "no http").not.toMatch(/http/i);
  expect(stripped, "no data:").not.toMatch(/data:/i);
  expect(stripped, "no local(").not.toMatch(/local\(/i);

  const faces = blocks(stripped);
  expect(faces, "exactly 2 @font-face blocks").toHaveLength(2);

  const roles = [
    { role: "display", font: raw.font.display, file: WOFF2.display },
    { role: "body", font: raw.font.body, file: WOFF2.body },
  ] as const;
  const families = faces.map((b) => prop(b, "font-family")[0]?.replace(/^["']|["']$/g, ""));
  expect(families.sort()).toEqual(roles.map((r) => firstFamily(r.font.family)).sort());

  for (const { role, font, file } of roles) {
    const family = firstFamily(font.family);
    const face = faces.find(
      (b) => prop(b, "font-family")[0]?.replace(/^["']|["']$/g, "") === family,
    );
    expect(face, `${role}: block for ${family}`).toBeDefined();
    const b = face as string;

    const weight = prop(b, "font-weight");
    expect(weight, `${family}: one font-weight`).toHaveLength(1);
    const [lo, hi = lo] = (weight[0] ?? "").split(" ").map(Number) as [number, number?];
    for (const w of font.weights) {
      expect(
        w >= lo && w <= (hi as number),
        `${family}: font-weight ${weight[0]} covers ${w}`,
      ).toBe(true);
    }

    expect(prop(b, "font-display"), `${family}: font-display`).toEqual(["swap"]);
    expect(prop(b, "font-style"), `${family}: font-style`).toEqual(["normal"]);

    const range = prop(b, "unicode-range");
    expect(range, `${family}: one unicode-range`).toHaveLength(1);
    const parts = (range[0] ?? "").split(",").map((s) => s.trim().toUpperCase());
    expect(parts, `${family}: unicode-range has U+0000-00FF`).toContain("U+0000-00FF");
    expect(parts, `${family}: unicode-range has U+20AC`).toContain("U+20AC");

    const src = prop(b, "src");
    expect(src, `${family}: one src`).toHaveLength(1);
    expect(src[0], `${family}: src`).toBe(`url("../fonts/${file}") format("woff2")`);
  }
}

/** sha256 values SOURCES.md records for each woff2 (first table row naming the file). */
function recordedSha(sources: string, file: string): string | undefined {
  const row = sources.split("\n").find((l) => l.startsWith("|") && l.includes(`\`${file}\``));
  return row ? /`([0-9a-f]{64})`/.exec(row)?.[1] : undefined;
}

/** AC3: throws when the font files, licences or SOURCES.md hashes are off. */
function checkFontFiles(sources: string): void {
  let total = 0;
  for (const file of Object.values(WOFF2)) {
    const path = resolve(fontsDir, file);
    expect(existsSync(path), `${file} exists`).toBe(true);
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString("latin1"), `${file} signature`).toBe("wOF2");
    expect(bytes.length, `${file} ≤ ${MAX_EACH} bytes`).toBeLessThanOrEqual(MAX_EACH);
    total += bytes.length;
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(recordedSha(sources, file), `${file} sha256 matches SOURCES.md`).toBe(sha);
  }
  expect(total, `woff2 total ≤ ${MAX_TOTAL} bytes`).toBeLessThanOrEqual(MAX_TOTAL);
  for (const ofl of ["OFL-BigShouldersDisplay.txt", "OFL-DMSans.txt"]) {
    const path = resolve(fontsDir, ofl);
    expect(existsSync(path), `${ofl} exists`).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  }
}

describe("F-1 fonts.css (T-0544 AC1, AC2)", () => {
  const css = readFileSync(cssPath, "utf8");

  it("AC1: two @font-face blocks matching tokens.json, swap, latin range, one relative woff2 src, nothing remote", () => {
    checkFontsCss(css);
  });

  it("AC2: a DM Sans font-weight of 400 600 fails on weight 700", () => {
    const faulty = css.replace("font-weight: 100 1000;", "font-weight: 400 600;");
    expect(faulty).not.toBe(css);
    expect(() => checkFontsCss(faulty)).toThrow(/DM Sans: font-weight 400 600 covers 700/);
  });

  it("AC1: a remote, data: or local() source fails", () => {
    for (const bad of [
      'url("https://x.test/a.woff2")',
      "url(data:font/woff2;base64,AA)",
      'local("DM Sans")',
    ]) {
      const faulty = css.replace('url("../fonts/dm-sans-latin-wght.woff2")', bad);
      expect(() => checkFontsCss(faulty)).toThrow();
    }
  });
});

describe("F-2 font files, budget, licences, sha256 (T-0544 AC3, AC4)", () => {
  const sources = readFileSync(sourcesPath, "utf8");

  it("AC3: both woff2 are wOF2, within budget, hashed in SOURCES.md; both OFL texts present", () => {
    checkFontFiles(sources);
  });

  it("AC3: SOURCES.md records the Reserved Font Name check", () => {
    expect(sources).toMatch(/Reserved Font Name check:\*\* none declared/);
  });

  it("AC4: one changed hex digit in the DM Sans sha256 fails on the sha256 assertion", () => {
    const sha = recordedSha(sources, WOFF2.body) as string;
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const flipped = sha.slice(0, -1) + (sha.endsWith("0") ? "1" : "0");
    const faulty = sources.replace(sha, flipped);
    expect(() => checkFontFiles(faulty)).toThrow(
      /dm-sans-latin-wght\.woff2 sha256 matches SOURCES\.md/,
    );
  });
});

describe("AC5 exports resolve (T-0544)", () => {
  // Package self-reference resolves through package.json "exports".
  const req = createRequire(resolve(pkgRoot, "package.json"));

  it("@workoutlab/design-tokens/fonts.css → src/fonts.css, and both url() targets exist", () => {
    const resolved = req.resolve("@workoutlab/design-tokens/fonts.css");
    expect(resolved).toBe(cssPath);
    const urls = [...readFileSync(resolved, "utf8").matchAll(/url\("([^"]+)"\)/g)].map(
      (m) => m[1] as string,
    );
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      const target = resolve(dirname(resolved), u);
      expect(existsSync(target), `${u} exists`).toBe(true);
    }
  });

  it("@workoutlab/design-tokens/fonts/<file>.woff2 resolves through exports['./fonts/*']", () => {
    for (const file of Object.values(WOFF2)) {
      const resolved = req.resolve(`@workoutlab/design-tokens/fonts/${file}`);
      expect(resolved).toBe(resolve(fontsDir, file));
      expect(statSync(resolved).isFile()).toBe(true);
    }
  });
});
