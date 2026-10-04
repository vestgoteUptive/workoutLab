// @vitest-environment node
// T-0306a AC-16: the export set, the import bans, no direct IndexedDB access, jsx-no-literals
// and the string module shape. Source scans exclude `__tests__/**`.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ESLint } from "eslint";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/** Recursive walk; skips any directory named `__tests__` at any depth. */
function sourceFiles(root: string = FEATURE_DIR): string[] {
  const out: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const full = resolve(root, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__") out.push(...sourceFiles(full));
    } else if (e.isFile() && /\.(tsx?|css)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Direct IndexedDB access: the bare `offlineDb` identifier or a dexie import. */
function idbViolations(source: string): string[] {
  const found: string[] = [];
  if (/\bofflineDb\b/.test(source)) found.push("offlineDb");
  if (/from ["']dexie["']/.test(source)) found.push("dexie");
  return found;
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
  it("no offlineDb identifier and no dexie import in the feature", () => {
    const files = sourceFiles().filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(idbViolations(readFileSync(file, "utf8")), file).toEqual([]);
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

  it("state styling is CSS, never inline: no style prop, and the chip keeps a :focus-visible ring", () => {
    for (const file of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\bstyle=/);
    }
    const css = readFileSync(resolve(FEATURE_DIR, "uf-04.css"), "utf8");
    expect(css).toMatch(/\.wl-uf04__chip:focus-visible[^{]*\{[^}]*outline:/);
    expect(css).toMatch(/\.wl-uf04__chip\[aria-pressed="true"\]/);
  });

  it("no hex colours in the feature's CSS or code", () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe("T-0361 source-scan hardening", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "t0361-"));
    dirs.push(root);
    for (const [name, body] of Object.entries(files)) {
      const full = join(root, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    return root;
  }
  const rel = (root: string, files: string[]) => files.map((f) => relative(root, f)).sort();
  const scan = (root: string) =>
    sourceFiles(root)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => idbViolations(readFileSync(f, "utf8")).length > 0)
      .map((f) => relative(root, f));

  it.each([
    'import { offlineDb } from "../../lib/offline/index.js";\nexport const X = 1;\n',
    "const db = offlineDb;\n",
    "offlineDb();\n",
    'import x from "dexie";\n',
  ])("AC-1 reports exactly one violation for %s", (src) => {
    expect(idbViolations(src)).toHaveLength(1);
  });

  it.each([
    'import { resetOfflineDbForTest } from "x";',
    'import { loadLibrary } from "../../lib/offline/index.js";',
    "const offlineDbName = 1;",
  ])("AC-2 no false positive for %s", (src) => {
    expect(idbViolations(src)).toEqual([]);
  });

  it("AC-3 walk is recursive, skips __tests__ at any depth, keeps testsupport", () => {
    const root = fixture({
      "top.tsx": "",
      "sub/nested.tsx": "",
      "sub/deeper/style.css": "",
      "sub/README.md": "",
      "sub/testsupport/helper.ts": "",
      "__tests__/t.ts": "",
      "sub/__tests__/u.ts": "",
    });
    expect(rel(root, sourceFiles(root))).toEqual([
      "sub/deeper/style.css",
      "sub/nested.tsx",
      "sub/testsupport/helper.ts",
      "top.tsx",
    ]);
  });

  it("AC-4 wired end to end: nested violation is named; clean root reports none", () => {
    const bad = fixture({
      "top.tsx": "export const A = 1;\n",
      "sub/nested.tsx": 'import { offlineDb } from "../../lib/offline/index.js";\n',
    });
    expect(scan(bad)).toEqual(["sub/nested.tsx"]);
    const clean = fixture({ "top.tsx": "export const A = 1;\n" });
    expect(scan(clean)).toEqual([]);
  });
});
