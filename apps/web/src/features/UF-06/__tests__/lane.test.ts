// @vitest-environment node
// T-0307b AC-13 (lint half) and AC-14 (exports, imports, strings), plus the focus rule of the
// calendar (WCAG 2.4.7): "today" is CSS keyed on a data attribute, never an inline outline.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { en } from "../../../lib/i18n/en.js";

const WEB_ROOT = process.cwd();
const FEATURE = resolve(__dirname, "..");
const eslint = new ESLint({ cwd: WEB_ROOT });

async function messages(relPath: string, code: string, ruleId: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(WEB_ROOT, relPath) });
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages.filter((m) => m.ruleId === ruleId);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "__tests__") return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const IMPORT = 'import { Progress } from "../UF-06/index.js";\nexport const X = Progress;\n';

describe("AC-13 UF-06 is not importable during a workout (lint)", () => {
  it.each(["UF-09", "UF-08", "UF-04"])("%s importing UF-06 is reported", async (flow) => {
    const found = await messages(`src/features/${flow}/x.tsx`, IMPORT, "no-restricted-imports");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("UF-02 importing UF-06 is not reported", async () => {
    expect(await messages("src/features/UF-02/x.tsx", IMPORT, "no-restricted-imports")).toEqual([]);
  });
});

describe("AC-14 exports, imports and strings", () => {
  it("exports exactly ExerciseHistory and Progress", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual(["ExerciseHistory", "Progress"]);
  });

  it("has no offlineDb(, no dexie import and no UF-10 import outside __tests__", () => {
    for (const file of sourceFiles(FEATURE)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/offlineDb\(/);
      expect(source, file).not.toMatch(/from\s+["']dexie["']/);
      expect(source, file).not.toMatch(/(^|[/"'])UF-10(\/|["'])/);
    }
  });

  it("every en.uf06.* key the feature uses exists", () => {
    const keys = new Set<string>();
    for (const file of sourceFiles(FEATURE)) {
      for (const m of readFileSync(file, "utf8").matchAll(/en\.uf06\.(\w+)/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(0);
    for (const key of keys) expect(en.uf06, key).toHaveProperty(key);
  });

  it("lints clean, including react/jsx-no-literals", async () => {
    for (const file of sourceFiles(FEATURE).filter((f) => f.endsWith(".tsx"))) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(result!.messages, file).toEqual([]);
    }
  });
});

describe("calendar focus (WCAG 2.4.7)", () => {
  const css = readFileSync(resolve(FEATURE, "progress.css"), "utf8");
  const component = readFileSync(resolve(FEATURE, "Progress.tsx"), "utf8");

  it("sets no inline outline on any cell", () => {
    expect(component).not.toMatch(/outline/);
  });

  it("styles today by data attribute and lets :focus-visible show the accent afterwards", () => {
    const today = css.indexOf('.wl-progress__day[data-today="true"] {');
    const focus = css.indexOf('.wl-progress__day[data-today="true"]:focus-visible');
    expect(today).toBeGreaterThanOrEqual(0);
    expect(focus).toBeGreaterThan(today);
    const focusRule = css.slice(focus, css.indexOf("}", focus));
    expect(focusRule).toMatch(/outline:\s*2px solid var\(--wl-color-accent\)/);
  });
});
