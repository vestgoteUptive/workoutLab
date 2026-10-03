// @vitest-environment node
// T-0304a AC-10 / T-0304e AC-10: strings from en.uf09 only, the export set, and the D-0071 §9
// import bans.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../../lib/i18n/en.js";

vi.mock("../../../lib/auth/client.js", () => ({ supabase: { from: vi.fn() } }));

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(__dirname, "..");
const eslint = new ESLint({ cwd: WEB_ROOT });

function sources(dir: string = FEATURE_DIR): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__" && name !== "__e2e__") out.push(...sources(path));
    } else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
}

async function lint(code: string, file = "src/features/UF-09/x.tsx") {
  const [result] = await eslint.lintText(code, { filePath: resolve(WEB_ROOT, file) });
  expect(result!.messages.filter((m) => m.fatal)).toEqual([]);
  return result!.messages;
}

describe("AC-10 exports", () => {
  it("features/UF-09/index.tsx exports exactly ResumeCard, SessionHost and useFocusSession (T-0395 AC8)", async () => {
    const mod = await import("../index.js");
    expect(Object.keys(mod).sort()).toEqual(["ResumeCard", "SessionHost", "useFocusSession"]);
  });
});

describe("AC-10 strings", () => {
  it("react/jsx-no-literals is green over every UF-09 .tsx file", async () => {
    const files = sources().filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals" || m.fatal),
        file,
      ).toEqual([]);
    }
  });

  it("the rule is live here: a bare literal in a UF-09 .tsx is reported", async () => {
    const found = (await lint("export const X = () => <h1>Rest</h1>;\n")).filter(
      (m) => m.ruleId === "react/jsx-no-literals",
    );
    expect(found.length).toBe(1);
  });

  it("every en.uf09 key the feature reads exists, and the feature reads no other flow's strings", () => {
    const keys = new Set<string>();
    for (const file of sources().filter((f) => /\.tsx?$/.test(f))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/en\.uf09\.(\w+)/g)) keys.add(m[1]!);
      expect(src, file).not.toMatch(/en\.uf(0[1-8]|1[01])\b/);
    }
    expect(keys.size).toBeGreaterThanOrEqual(8);
    for (const key of keys) expect(Object.keys(en.uf09), key).toContain(key);
  });

  it("no hex colours in the feature's CSS or code", () => {
    for (const file of sources())
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("AC-10 import bans (D-0071 §9)", () => {
  it.each([
    'import { BodyMap } from "../../components/body-map/index.js";\nexport const X = BodyMap;\n',
    'import { Today } from "../UF-02/index.js";\nexport const X = Today;\n',
    'import { Progress } from "../UF-06/index.js";\nexport const X = Progress;\n',
    'import { R } from "../UF-07/index.js";\nexport const X = R;\n',
    'import { Balance } from "../UF-10/index.js";\nexport const X = Balance;\n',
    'import { Plan } from "../UF-11/index.js";\nexport const X = Plan;\n',
  ])("reports no-restricted-imports for %s", async (code) => {
    const found = (await lint(code)).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it("the shipped files are green under the bans, and import none of them", async () => {
    for (const file of sources().filter((f) => /\.tsx?$/.test(f))) {
      const src = readFileSync(file, "utf8");
      const [result] = await eslint.lintText(src, { filePath: file });
      expect(result!.messages, file).toEqual([]);
      expect(src, file).not.toMatch(/components\/body-map|UF-(02|06|07|10|11)/);
    }
  });

  it("T-0304e: seams.tsx imports nothing from features/UF-03, UF-04 or UF-05 yet (no cycles)", () => {
    const src = readFileSync(join(FEATURE_DIR, "seams.tsx"), "utf8");
    const imports = [...src.matchAll(/^\s*import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThanOrEqual(1);
    for (const path of imports) expect(path).not.toMatch(/UF-0[345]/);
  });

  it("contrast: the offline module is allowed", async () => {
    const found = (
      await lint(
        'import { offlineDb } from "../../lib/offline/index.js";\nexport const X = offlineDb;\n',
      )
    ).filter((m) => m.ruleId === "no-restricted-imports");
    expect(found).toEqual([]);
  });
});
