// @vitest-environment node
// T-0419 AC-8's lint half and AC-9 (strings, exports): the UF-03 import ban on UF-11, the export
// set of features/UF-03/index.tsx (T-0416 extends it), jsx-no-literals over the feature, and the
// en.uf03 keys the feature reads. Source scans exclude `__tests__/**`.
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
    filePath: resolve(WEB_ROOT, "src/features/UF-03/x.tsx"),
  });
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages;
}

function sourceFiles(): string[] {
  return readdirSync(FEATURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name))
    .map((e) => resolve(FEATURE_DIR, e.name));
}

describe("AC-9 exports", () => {
  it("features/UF-03/index.tsx exports exactly Summary", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual(["Summary"]);
  });
});

describe("AC-8 import bans (principle 1, the T-0318 rule)", () => {
  it("a features/UF-03 file importing features/UF-11/index.js reports no-restricted-imports", async () => {
    const found = (
      await messages('import { Plan } from "../UF-11/index.js";\nexport const X = Plan;\n')
    ).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("CONTRAST: the offline loaders are allowed", async () => {
    const found = (
      await messages(
        'import { loadTargets } from "../../lib/offline/index.js";\nexport const X = loadTargets;\n',
      )
    ).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found).toEqual([]);
  });
});

describe("AC-9 strings", () => {
  it("jsx-no-literals stays green over the feature's .tsx files", async () => {
    const files = sourceFiles().filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals" || m.fatal),
        file,
      ).toEqual([]);
    }
  });

  it("CONTRAST: jsx-no-literals does fire on a bare string in a UF-03 file", async () => {
    const found = (await messages("export const X = () => <p>Workout done</p>;\n")).filter(
      (m) => m.ruleId === "react/jsx-no-literals",
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("every en.uf03 key the feature reads exists", () => {
    const keys = new Set<string>();
    for (const file of sourceFiles().filter((f) => /\.tsx?$/.test(f))) {
      for (const m of readFileSync(file, "utf8").matchAll(/en\.uf03\.(\w+)/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) expect(Object.keys(en.uf03), key).toContain(key);
  });

  it("flows/uf-03.ts keeps its closing `} as const;` at column 0 (D-0075)", () => {
    const source = readFileSync(resolve(WEB_ROOT, "src/lib/i18n/flows/uf-03.ts"), "utf8");
    expect(source).toMatch(/^export const uf03 = \{[\s\S]*?\n\} as const;$/m);
  });

  it("no hex colours in the feature's CSS or code", () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("no refresh*, no useAuth and no Edge Function in the feature (D-0142 §4)", () => {
    for (const file of sourceFiles().filter((f) => /\.tsx?$/.test(f))) {
      // Code only: the comments may name what the file doesn't do.
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/\brefresh[A-Z]\w*\s*\(/);
      expect(source, file).not.toMatch(/\buseAuth\b/);
      expect(source, file).not.toMatch(/functions\/v1/);
    }
  });
});
