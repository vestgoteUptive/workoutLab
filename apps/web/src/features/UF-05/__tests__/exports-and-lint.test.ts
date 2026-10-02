// @vitest-environment node
// T-0421 AC-12 (exports and imports) and the AC-6 source test: the sheet builds no item. Source
// scans read the feature's own files and exclude `__tests__/**`.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(__dirname, "..");
const eslint = new ESLint({ cwd: WEB_ROOT });

function sourceFiles(ext: RegExp = /\.(tsx?|css)$/): string[] {
  return readdirSync(FEATURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && ext.test(e.name))
    .map((e) => resolve(FEATURE_DIR, e.name));
}

function code(): Array<[string, string]> {
  const files = sourceFiles(/\.tsx?$/);
  expect(files.length).toBeGreaterThanOrEqual(3);
  return files.map((f) => [f, readFileSync(f, "utf8")]);
}

describe("AC-12 exports", () => {
  it("index exports exactly SwapSheet", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod)).toEqual(["SwapSheet"]);
  });
});

describe("AC-12 import bans (D-0071 §4 §9)", () => {
  const BANNED =
    /from\s+["'][^"']*(features\/|\.\.\/)(UF-0[2679]|UF-1[01])\b|from\s+["'][^"']*components\/body-map/;

  it("no import of UF-09, UF-02, UF-06, UF-07, UF-10, UF-11 or components/body-map", () => {
    for (const [file, source] of code()) {
      expect(source, file).not.toMatch(BANNED);
      expect(source, file).not.toMatch(/import\(\s*["'][^"']*(UF-0[2679]|UF-1[01]|body-map)/);
    }
  });

  // The scan can fail: each planted import matches, and the allowed one doesn't.
  it.each([
    ['import { X } from "../UF-09/index.js";', true],
    ['import { X } from "../../features/UF-11/index.js";', true],
    ['import { X } from "../../components/body-map/index.js";', true],
    ['import { X } from "../UF-04/index.js";', false],
  ])("the scan flags %s: %s", (line, flagged) => {
    expect(BANNED.test(line)).toBe(flagged);
  });

  it.each([
    'import { Balance } from "../UF-10/index.js";\nexport const X = Balance;\n',
    'import { SessionHost } from "../UF-09/session.js";\nexport const X = SessionHost;\n',
    'import { BodyMap } from "../../components/body-map/index.js";\nexport const X = BodyMap;\n',
  ])("ESLint reports no-restricted-imports for %s", async (source) => {
    const [result] = await eslint.lintText(source, {
      filePath: resolve(WEB_ROOT, "src/features/UF-05/x.tsx"),
    });
    expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
    expect(
      result!.messages.filter((m) => m.ruleId === "no-restricted-imports").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("contrast: the offline loaders and the engine are allowed", async () => {
    const [result] = await eslint.lintText(
      'import { loadLibrary } from "../../lib/offline/history.js";\nimport { rankSwaps } from "@workoutlab/engine";\nexport const X = [loadLibrary, rankSwaps];\n',
      { filePath: resolve(WEB_ROOT, "src/features/UF-05/x.tsx") },
    );
    expect(result!.messages.filter((m) => m.ruleId === "no-restricted-imports")).toEqual([]);
  });
});

describe("AC-6 the sheet builds no item (principle 3)", () => {
  it("no prefill( call, no costS arithmetic, no reasons construction, no item spread", () => {
    for (const [file, source] of code()) {
      expect(source, file).not.toMatch(/\bprefill\s*\(/);
      expect(source, file).not.toMatch(/\bcostS\b/);
      expect(source, file).not.toMatch(/\breasons\b/); // an item's `reasons` is engine output
      expect(source, file).not.toMatch(/code:\s*["']/);
      expect(source, file).not.toMatch(/\.\.\.\s*[\w.]*items\[/);
      expect(source, file).not.toMatch(/\bitemCostS\b|\bsetCostS\b|\bavailableS\b/);
      expect(source, file).not.toMatch(/\.sort\(|\.filter\(\s*\(?\s*c\b/);
    }
  });

  it("no direct IndexedDB access and no refresh (D-0111 §11)", () => {
    for (const [file, source] of code()) {
      expect(source, file).not.toMatch(/offlineDb\(|from ["']dexie["']/);
      expect(source, file).not.toMatch(/\brefresh[A-Z]\w*/);
      expect(source, file).not.toMatch(/\bfetch\(|supabase/);
    }
  });
});

describe("strings", () => {
  it("jsx-no-literals stays green over the feature's .tsx files", async () => {
    for (const file of sourceFiles(/\.tsx$/)) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals" || m.fatal),
        file,
      ).toEqual([]);
    }
  });

  it("every en.uf05 key the feature reads exists", () => {
    const keys = new Set<string>();
    for (const [, source] of code()) {
      for (const m of source.matchAll(/en\.uf05\.(\w+)/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) expect(Object.keys(en.uf05), key).toContain(key);
  });

  it("the UF-05 copy matches the ticket text", () => {
    expect(en.uf05.title("Barbell row")).toBe("Replace Barbell row");
    expect(en.uf05.use("Db row")).toBe("Use Db row");
    expect(en.uf05.empty).toBe("No alternatives fit your equipment");
    expect(en.uf05.loadFailed).toBe("Couldn't load alternatives.");
    expect(en.uf05.saveFailed).toBe("Couldn't save the swap. Try again.");
    expect(en.uf05.swapFailed).toBe("Couldn't swap to that exercise.");
    expect(en.uf05.tagOverTime).toBe("Over your time");
  });

  it("state styling is CSS, never inline, and no hex anywhere", () => {
    for (const file of sourceFiles(/\.tsx$/)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\bstyle=/);
    }
    for (const file of sourceFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
