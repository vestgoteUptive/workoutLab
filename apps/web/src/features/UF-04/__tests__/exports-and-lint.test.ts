// @vitest-environment node
// T-0306a AC-16: the export set, the import bans, no direct IndexedDB access, jsx-no-literals
// and the string module shape. Source scans exclude `__tests__/**`.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(__dirname, "..");
const eslint = new ESLint({ cwd: WEB_ROOT });

async function messages(code: string) {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(WEB_ROOT, "src/features/UF-04/x.tsx"),
  });
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages;
}

function sourceFiles(): string[] {
  return readdirSync(FEATURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name))
    .map((e) => resolve(FEATURE_DIR, e.name));
}

describe("AC-16 exports", () => {
  it("index exports exactly Compare, ExerciseHowTo, Library, LibraryDetail", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual([
      "Compare",
      "ExerciseHowTo",
      "Library",
      "LibraryDetail",
    ]);
  });
});

describe("AC-16 import bans (D-0071 §9)", () => {
  it.each([
    'import { Progress } from "../UF-06/index.js";\nexport const X = Progress;\n',
    'import { BodyMap } from "../../components/body-map/index.js";\nexport const X = BodyMap;\n',
  ])("reports no-restricted-imports for %s", async (code) => {
    const found = (await messages(code)).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("contrast: the offline loaders are allowed", async () => {
    const found = (
      await messages(
        'import { loadLibrary } from "../../lib/offline/index.js";\nexport const X = loadLibrary;\n',
      )
    ).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found).toEqual([]);
  });
});

describe("AC-16 no direct IndexedDB access outside tests (D-0067 §5)", () => {
  it("no offlineDb( and no dexie import in the feature", () => {
    const files = sourceFiles().filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/offlineDb\(/);
      expect(source, file).not.toMatch(/from ["']dexie["']/);
    }
  });
});

describe("AC-16 strings", () => {
  it("jsx-no-literals stays green over the feature's .tsx files", async () => {
    for (const file of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals" || m.fatal),
        file,
      ).toEqual([]);
    }
  });

  it("every en.uf04 key the feature reads exists", () => {
    const keys = new Set<string>();
    for (const file of sourceFiles().filter((f) => /\.tsx?$/.test(f))) {
      for (const m of readFileSync(file, "utf8").matchAll(/en\.uf04\.(\w+)/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(20);
    for (const key of keys) expect(Object.keys(en.uf04), key).toContain(key);
  });

  it("flows/uf-04.ts keeps its closing `} as const;` at column 0 (D-0075)", () => {
    const source = readFileSync(resolve(WEB_ROOT, "src/lib/i18n/flows/uf-04.ts"), "utf8");
    expect(source).toMatch(/^export const uf04 = \{[\s\S]*?\n\} as const;$/m);
  });

  it("no hex colours in the feature's CSS or code", () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
