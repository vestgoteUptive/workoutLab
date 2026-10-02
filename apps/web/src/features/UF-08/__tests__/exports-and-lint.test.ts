// @vitest-environment node
// T-0303a AC-13: strings from `en.uf08` (D-0075 shape), jsx-no-literals, the export set, and the
// D-0071 §9 import bans. Source scans exclude `__tests__/**`.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";
import { uf08 } from "../../../lib/i18n/flows/uf-08.js";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(__dirname, "..");
const eslint = new ESLint({ cwd: WEB_ROOT });

function sourceFiles(): string[] {
  return readdirSync(FEATURE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name))
    .map((e) => resolve(FEATURE_DIR, e.name));
}

async function lintAs(code: string, file = "src/features/UF-08/x.tsx") {
  const [result] = await eslint.lintText(code, { filePath: resolve(WEB_ROOT, file) });
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages;
}

describe("AC-13 exports", () => {
  it('index exports exactly ["SessionSetup"]', async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod)).toEqual(["SessionSetup"]);
  });
});

describe("AC-13 import bans (D-0071 §9)", () => {
  it.each([
    'import { BodyMap } from "../../components/body-map/index.js";\nexport const X = BodyMap;\n',
    'import { Today } from "../UF-02/index.js";\nexport const X = Today;\n',
    'import { Progress } from "../UF-06/index.js";\nexport const X = Progress;\n',
    'import { RoutineEditor } from "../UF-07/index.js";\nexport const X = RoutineEditor;\n',
    'import { Balance } from "../UF-10/index.js";\nexport const X = Balance;\n',
    'import { Plan } from "../UF-11/index.js";\nexport const X = Plan;\n',
  ])("reports no-restricted-imports for %s", async (code) => {
    const found = (await lintAs(code)).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("contrast: the offline loaders and the engine are allowed", async () => {
    const found = (
      await lintAs(
        'import { loadLibrary } from "../../lib/offline/history.js";\nimport { suggest } from "@workoutlab/engine";\nexport const X = [loadLibrary, suggest];\n',
      )
    ).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found).toEqual([]);
  });

  it("the feature's own sources import none of the banned modules", async () => {
    for (const file of sourceFiles().filter((f) => /\.tsx?$/.test(f))) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "no-restricted-imports" || m.fatal),
        file,
      ).toEqual([]);
      // T-0303b: `lib/i18n/workout.ts` is now imported (read-only, D-0109 §7); its ban moved to
      // the "workout.ts is imported, never re-implemented" test below.
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /features\/UF-(02|06|07|10|11)|components\/body-map/,
      );
    }
  });
});

describe("AC-13 strings", () => {
  it("jsx-no-literals stays green over the feature's .tsx files", async () => {
    const files = sourceFiles().filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals" || m.fatal),
        file,
      ).toEqual([]);
    }
  });

  it("contrast: a bare literal in a UF-08 .tsx is reported", async () => {
    const found = (await lintAs("export const X = () => <p>Hello</p>;\n")).filter(
      (m) => m.ruleId === "react/jsx-no-literals",
    );
    expect(found.length).toBe(1);
  });

  it("every en.uf08 key the feature reads exists, and en.uf08 is the flow module itself", () => {
    expect(en.uf08).toBe(uf08);
    const keys = new Set<string>();
    for (const file of sourceFiles().filter((f) => /\.tsx?$/.test(f))) {
      for (const m of readFileSync(file, "utf8").matchAll(/en\.uf08\.(\w+)/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(15);
    for (const key of keys) expect(Object.keys(en.uf08), key).toContain(key);
  });

  it("flows/uf-08.ts is the multi-line `export const uf08 = {…} as const;` (D-0075)", () => {
    const source = readFileSync(resolve(WEB_ROOT, "src/lib/i18n/flows/uf-08.ts"), "utf8");
    expect(source).toMatch(/^export const uf08 = \{\n[\s\S]*?\n\} as const;$/m);
  });

  it("no hex colours and no font-family other than the token variables", () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      for (const m of source.matchAll(/font-family:\s*([^;]+);/g)) {
        expect(m[1], file).toMatch(/^var\(--wl-font-(display|body)\)$/);
      }
    }
  });

  it("no inline style props", () => {
    for (const file of sourceFiles().filter((f) => f.endsWith(".tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\bstyle=/);
    }
  });
});

// ---- T-0303b AC-11 ----
// The "en.ts and workout.ts unchanged" and AC-13 "shell files unchanged" checks are a
// `git diff --name-only main...HEAD` in the review/DoD run (ticket build log); lanes are enforced
// by check-lane-paths. Here: workout.ts is imported read-only, from one file, by its own names.

/** UF-08 source files that mention `lib/i18n/workout` in any import form. */
function workoutImporters(files: { name: string; source: string }[]): string[] {
  return files.filter((f) => /lib\/i18n\/workout/.test(f.source)).map((f) => f.name);
}

describe("T-0303b AC-11 workout.ts is imported, never edited or re-implemented (D-0109 §7)", () => {
  const files = () =>
    sourceFiles()
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => ({ name: f.split("/").at(-1)!, source: readFileSync(f, "utf8") }));

  it("only Suggested.tsx mentions lib/i18n/workout, in any import form", () => {
    expect(workoutImporters(files())).toEqual(["Suggested.tsx"]);
  });

  it("contrast: a namespace, type-only or extensionless import elsewhere is caught", () => {
    const base = files();
    for (const source of [
      'import * as w from "../../lib/i18n/workout.js";\nexport const X = w;\n',
      'import type { itemSummary } from "../../lib/i18n/workout";\n',
      'export { areaName } from "../../lib/i18n/workout.js";\n',
    ]) {
      expect(workoutImporters([...base, { name: "Other.tsx", source }]), source).toEqual([
        "Suggested.tsx",
        "Other.tsx",
      ]);
    }
  });

  it("Suggested.tsx imports only names workout.ts exports", async () => {
    const workout = await import("../../../lib/i18n/workout.js");
    const source = files().find((f) => f.name === "Suggested.tsx")!.source;
    const imports = [
      ...source.matchAll(/import \{([^}]*)\} from "\.\.\/\.\.\/lib\/i18n\/workout\.js"/g),
    ];
    expect(imports).toHaveLength(1);
    const names = imports[0]![1]!
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(Object.keys(workout), name).toContain(name);
  });
});
