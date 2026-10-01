// @vitest-environment node
// T-0301b AC-1, AC-9 (import half) and AC-11: source tests, because what a module's *static*
// import graph contains is not observable from a rendered DOM. UF-01.1–.3 and the splat that
// mounts them must never pull in the engine, the offline store, the profile gate, the auth
// client or supabase-js (principle 5), and UF-01.2–.4 must load only through `React.lazy`.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const WEB_ROOT = process.cwd();
const FEATURE_DIR = resolve(__dirname, "..");
const SRC = resolve(WEB_ROOT, "src");

const BANNED: Array<[string, RegExp]> = [
  ["@workoutlab/engine", /^@workoutlab\/engine(\/|$)/],
  ["@supabase/supabase-js", /^@supabase\/supabase-js(\/|$)/],
  ["lib/offline", /(^|\/)lib\/offline(\/|$)/],
  ["lib/profile", /(^|\/)lib\/profile(\/|$)/],
  ["lib/auth/client", /(^|\/)lib\/auth\/client(\.js|\.ts|\/|$)/],
];

/** Value (non-type) static `import … from`, `export … from` and bare `import "…"` specifiers. */
export function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[2]!);
  const bare = /^\s*import\s+["']([^"']+)["']/gm;
  while ((m = bare.exec(source))) out.push(m[1]!);
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
  ]) {
    if (/\.(tsx?|css)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  throw new Error(`unresolved ${spec} from ${from}`);
}

/** Every specifier reachable by static imports from `entry`, with the file that imports it. */
export function staticGraph(entry: string): Array<{ file: string; spec: string }> {
  const seen = new Set<string>();
  const found: Array<{ file: string; spec: string }> = [];
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file) || file.endsWith(".css")) continue;
    seen.add(file);
    for (const spec of staticSpecifiers(readFileSync(file, "utf8"))) {
      found.push({ file: file.slice(SRC.length + 1), spec });
      const next = resolveLocal(file, spec);
      if (next) stack.push(next);
    }
  }
  return found;
}

function offenders(entry: string): string[] {
  return staticGraph(entry)
    .filter(({ spec }) => BANNED.some(([, re]) => re.test(spec)))
    .map(({ file, spec }) => `${file} → ${spec}`);
}

const MODULES = {
  "UF-01.1": "WelcomeScreen.tsx",
  "UF-01.2": "GoalScreen.tsx",
  "UF-01.3": "LevelScreen.tsx",
  "UF-01.4 placeholder": "SchedulePlaceholder.tsx",
  "the /welcome/* splat": "WelcomeRoutes.tsx",
} as const;

describe("AC-1 / AC-9 the UF-01.1–.3 static import graphs", () => {
  it.each(Object.entries(MODULES))(
    "%s (%s) reaches none of engine, lib/offline, lib/profile, lib/auth/client, supabase-js",
    (_id, file) => {
      expect(offenders(resolve(FEATURE_DIR, file))).toEqual([]);
    },
  );

  it("the graph walk is not vacuous: it follows into en.ts and pending-plan.ts", () => {
    const specs = staticGraph(resolve(FEATURE_DIR, "WelcomeRoutes.tsx")).map((e) => e.spec);
    expect(specs).toContain("./pending-plan.js");
    expect(specs).toContain("./equipment-profiles.js");
    expect(specs).toContain("./flows/uf-01.js");
  });

  it("the check fires: index.tsx (UF-01.5, out of scope) does reach lib/auth/client", () => {
    expect(offenders(resolve(FEATURE_DIR, "index.tsx"))).toContain(
      "features/UF-01/index.tsx → ../../lib/auth/client.js",
    );
  });

  it("each banned pattern matches the specifier forms it guards", () => {
    const forms = [
      "@workoutlab/engine",
      "@supabase/supabase-js",
      "../../lib/offline/index.js",
      "../../lib/profile/index.js",
      "../../lib/auth/client.js",
    ];
    forms.forEach((spec, i) => expect(BANNED[i]![1].test(spec), spec).toBe(true));
    expect(BANNED.some(([, re]) => re.test("../../lib/auth/magic-link.js"))).toBe(false);
  });
});

describe("AC-1 UF-01.2, UF-01.3 and UF-01.4 load only through React.lazy", () => {
  const LAZY = ["GoalScreen", "LevelScreen", "SchedulePlaceholder"];

  it("the splat imports them only as lazy(() => import(…))", () => {
    const source = readFileSync(resolve(FEATURE_DIR, "WelcomeRoutes.tsx"), "utf8");
    for (const name of LAZY) {
      expect(source).toMatch(
        new RegExp(`lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*["']\\./${name}\\.js["']\\s*\\)`),
      );
    }
    expect(source).toMatch(/import \{[^}]*\blazy\b[^}]*\} from "react"/);
  });

  it("and the splat's first chunk (index.tsx's static graph) contains none of them", () => {
    const files = new Set(
      staticGraph(resolve(FEATURE_DIR, "index.tsx"))
        .map((e) => e.spec)
        .filter((s) => s.startsWith("./")),
    );
    for (const name of LAZY) expect(files.has(`./${name}.js`), name).toBe(false);
    expect(files.has("./WelcomeScreen.js")).toBe(true);
  });

  it("they value-import no feature module the splat's chunk holds (keeps its manifest entry)", () => {
    const splatLocal = new Set(
      staticGraph(resolve(FEATURE_DIR, "index.tsx"))
        .map((e) => e.spec)
        .filter((s) => s.startsWith("./")),
    );
    expect(splatLocal.has("./pending-plan.js")).toBe(true);
    for (const name of LAZY) {
      const specs = staticSpecifiers(readFileSync(resolve(FEATURE_DIR, `${name}.tsx`), "utf8"));
      expect(
        specs.filter((s) => splatLocal.has(s)),
        name,
      ).toEqual([]);
    }
  });

  it("no non-test file in the feature imports them statically", () => {
    const sources = readdirSync(FEATURE_DIR).filter((f) => /\.tsx?$/.test(f));
    for (const file of sources) {
      const specs = staticSpecifiers(readFileSync(resolve(FEATURE_DIR, file), "utf8"));
      for (const name of LAZY) expect(specs, file).not.toContain(`./${name}.js`);
    }
  });
});

describe("AC-11 strings (NFR-I18N-1)", () => {
  const eslint = new ESLint({ cwd: WEB_ROOT });

  it("react/jsx-no-literals is green over every UF-01 .tsx", async () => {
    const files = readdirSync(FEATURE_DIR).filter((f) => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const name of files) {
      const file = resolve(FEATURE_DIR, name);
      const [result] = await eslint.lintText(readFileSync(file, "utf8"), { filePath: file });
      expect(
        result!.messages.filter((m) => m.ruleId === "react/jsx-no-literals" || m.fatal),
        name,
      ).toEqual([]);
    }
  });

  it("contrast: the rule does fire on a literal in this folder", async () => {
    const [result] = await eslint.lintText("export const X = () => <p>Get started</p>;\n", {
      filePath: resolve(FEATURE_DIR, "x.tsx"),
    });
    expect(result!.messages.map((m) => m.ruleId)).toContain("react/jsx-no-literals");
  });

  it("the UF-01.1–.3 modules take their copy from en.uf01 only", () => {
    for (const file of [
      "WelcomeScreen.tsx",
      "GoalScreen.tsx",
      "LevelScreen.tsx",
      "StepHeader.tsx",
    ]) {
      const source = readFileSync(resolve(FEATURE_DIR, file), "utf8");
      const enUses = source.match(/(?<![\w./])en\.[a-zA-Z0-9]+/g) ?? [];
      expect(enUses.length, file).toBeGreaterThan(0);
      expect(new Set(enUses), file).toEqual(new Set(["en.uf01"]));
    }
  });
});
