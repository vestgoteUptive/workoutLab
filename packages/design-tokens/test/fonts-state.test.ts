// T-0583 AC5 (D-0208 §4, rules: docs/specs/visual-foundation.md §1): fonts-state.css self-hosts
// Familjen Grotesk (font.plan) and Bricolage Grotesque (font.session) as variable latin woff2.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../src/tokens.json";
import { pkgRoot } from "./helpers";

const fontsDir = resolve(pkgRoot, "fonts");
const cssPath = resolve(pkgRoot, "src/fonts-state.css");
const sourcesPath = resolve(fontsDir, "SOURCES.md");

const ROLES = [
  {
    role: "plan",
    font: raw.font.plan,
    file: "familjen-grotesk-latin-wght.woff2",
    ofl: "OFL-FamiljenGrotesk.txt",
    copyright: "Copyright 2021 The Familjen Grotesk Project Authors",
    // AC5: the weight range the ticket names, beyond tokens.json's weights.
    covers: [400, 700],
  },
  {
    role: "session",
    font: raw.font.session,
    file: "bricolage-grotesque-latin-wght.woff2",
    ofl: "OFL-BricolageGrotesque.txt",
    copyright: "Copyright 2022 The Bricolage Grotesque Project Authors",
    covers: [400, 800],
  },
] as const;
// visual-foundation §1 budget, applied to the fonts-state.css pair (D-0209).
const MAX_EACH = 61_440;
const MAX_TOTAL = 112_640;

function firstFamily(stack: string): string {
  return (stack.split(",")[0]?.trim() ?? "").replace(/^["']|["']$/g, "");
}
function blocks(css: string): string[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
}
function prop(block: string, name: string): string[] {
  const re = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`, "g");
  return [...block.matchAll(re)].map((m) => (m[1] ?? "").replace(/\s+/g, " ").trim());
}
const unquote = (s: string | undefined) => s?.replace(/^["']|["']$/g, "");

/** Throws (vitest assertion) when fonts-state.css doesn't match the spec / tokens.json. */
function checkStateCss(css: string): void {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(stripped, "no http").not.toMatch(/http/i);
  expect(stripped, "no //host").not.toMatch(/url\(\s*["']?\/\//i);
  expect(stripped, "no data:").not.toMatch(/data:/i);
  expect(stripped, "no local(").not.toMatch(/local\(/i);
  expect(stripped, "no @import").not.toMatch(/@import/i);

  const faces = blocks(stripped);
  expect(faces, "exactly 2 @font-face blocks").toHaveLength(2);
  for (const { font, file, covers } of ROLES) {
    const family = firstFamily(font.family);
    const face = faces.find((b) => unquote(prop(b, "font-family")[0]) === family);
    expect(face, `block for ${family}`).toBeDefined();
    const b = face as string;
    const weight = prop(b, "font-weight");
    expect(weight, `${family}: one font-weight`).toHaveLength(1);
    const [lo, hi = lo] = (weight[0] ?? "").split(" ").map(Number) as [number, number?];
    for (const w of [...font.weights, ...covers]) {
      expect(
        w >= lo && w <= (hi as number),
        `${family}: font-weight ${weight[0]} covers ${w}`,
      ).toBe(true);
    }
    expect(prop(b, "font-display"), `${family}: font-display`).toEqual(["swap"]);
    expect(prop(b, "font-style"), `${family}: font-style`).toEqual(["normal"]);
    const range = (prop(b, "unicode-range")[0] ?? "").split(",").map((s) => s.trim());
    expect(range, `${family}: latin range`).toContain("U+0000-00FF");
    expect(range, `${family}: euro`).toContain("U+20AC");
    expect(prop(b, "src"), `${family}: one same-origin src`).toEqual([
      `url("../fonts/${file}") format("woff2")`,
    ]);
  }
}

function recordedSha(sources: string, file: string): string | undefined {
  const row = sources.split("\n").find((l) => l.startsWith("|") && l.includes(`\`${file}\``));
  return row ? /`([0-9a-f]{64})`/.exec(row)?.[1] : undefined;
}

/** Throws when the files, licences, hashes or budget are off. */
function checkStateFiles(sources: string): void {
  let total = 0;
  for (const { file, ofl, copyright } of ROLES) {
    const path = resolve(fontsDir, file);
    expect(existsSync(path), `${file} exists`).toBe(true);
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 4).toString("latin1"), `${file} signature`).toBe("wOF2");
    expect(bytes.length, `${file} ≤ ${MAX_EACH} bytes`).toBeLessThanOrEqual(MAX_EACH);
    total += bytes.length;
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(recordedSha(sources, file), `${file} sha256 matches SOURCES.md`).toBe(sha);

    const oflPath = resolve(fontsDir, ofl);
    expect(existsSync(oflPath), `${ofl} exists`).toBe(true);
    const text = readFileSync(oflPath, "utf8");
    expect(text, `${ofl} is the OFL`).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(text.split("\n")[0], `${ofl} copyright line`).toContain(copyright);
    expect(text.split("\n")[0], `${ofl} declares no Reserved Font Name`).not.toMatch(/Reserved/i);
    const oflSha = createHash("sha256").update(readFileSync(oflPath)).digest("hex");
    expect(recordedSha(sources, ofl), `${ofl} sha256 matches SOURCES.md`).toBe(oflSha);
  }
  expect(total, `fonts-state pair ≤ ${MAX_TOTAL} bytes`).toBeLessThanOrEqual(MAX_TOTAL);
}

describe("AC5 fonts-state.css (T-0583)", () => {
  const css = readFileSync(cssPath, "utf8");

  it("declares both families from tokens.json, swap, latin, same-origin woff2 only", () => {
    checkStateCss(css);
  });
  it("planted fault: a Bricolage weight range without 800 fails", () => {
    const faulty = css.replace("font-weight: 200 800;", "font-weight: 200 700;");
    expect(faulty).not.toBe(css);
    expect(() => checkStateCss(faulty)).toThrow(
      /Bricolage Grotesque: font-weight 200 700 covers 800/,
    );
  });
  it("planted fault: a removed @font-face fails", () => {
    const faulty = css.replace(/@font-face\s*\{[^}]*Familjen[^}]*\}/, "");
    expect(faulty).not.toBe(css);
    expect(() => checkStateCss(faulty)).toThrow(/exactly 2 @font-face/);
  });
  it("planted fault: a third-party host or a data: URI fails", () => {
    for (const bad of [
      'url("https://fonts.gstatic.com/s/x.woff2")',
      'url("//cdn.test/x.woff2")',
      "url(data:font/woff2;base64,AA)",
    ]) {
      const faulty = css.replace('url("../fonts/familjen-grotesk-latin-wght.woff2")', bad);
      expect(() => checkStateCss(faulty), bad).toThrow();
    }
  });
});

describe("AC5 font files, licences, sha256, budget (T-0583)", () => {
  const sources = readFileSync(sourcesPath, "utf8");

  it("both woff2 are wOF2, hashed in SOURCES.md, within budget; both OFL texts present", () => {
    checkStateFiles(sources);
  });
  it("SOURCES.md records the Reserved Font Name check for the D-0208 fonts", () => {
    expect(sources).toMatch(/Reserved Font Name check \(D-0208 fonts\):\*\* none declared/);
  });
  it("planted fault: one changed hex digit in the Bricolage sha256 fails", () => {
    const file = "bricolage-grotesque-latin-wght.woff2";
    const sha = recordedSha(sources, file) as string;
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const flipped = sha.slice(0, -1) + (sha.endsWith("0") ? "1" : "0");
    expect(() => checkStateFiles(sources.replace(sha, flipped))).toThrow(
      /bricolage-grotesque-latin-wght\.woff2 sha256 matches SOURCES\.md/,
    );
  });
});

describe("AC5 export resolves (T-0583)", () => {
  const req = createRequire(resolve(pkgRoot, "package.json"));
  it("@workoutlab/design-tokens/fonts-state.css → src/fonts-state.css; url() targets exist", () => {
    const resolved = req.resolve("@workoutlab/design-tokens/fonts-state.css");
    expect(resolved).toBe(cssPath);
    const urls = [...readFileSync(resolved, "utf8").matchAll(/url\("([^"]+)"\)/g)].map(
      (m) => m[1] as string,
    );
    expect(urls).toHaveLength(2);
    for (const u of urls) expect(existsSync(resolve(dirname(resolved), u)), u).toBe(true);
  });
  it("the T-0544 fonts.css is untouched by the new export", () => {
    expect(req.resolve("@workoutlab/design-tokens/fonts.css")).toBe(
      resolve(pkgRoot, "src/fonts.css"),
    );
  });
});
