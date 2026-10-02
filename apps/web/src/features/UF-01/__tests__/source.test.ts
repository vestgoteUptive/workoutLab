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

describe("AC-1 UF-01.2, UF-01.3, UF-01.4 and /welcome/save load only through React.lazy", () => {
  // T-0301c AC-11: `SaveScreen` (UF-01.5-save) joins the list.
  const LAZY = ["GoalScreen", "LevelScreen", "ScheduleScreen", "SaveScreen"];

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

// T-0301d AC-9 (principle 5) and the source half of AC-1 (principle 3). T-0301c AC-11 widens it:
// `/welcome/save` writes the `deriveTargets` result, so it imports the engine too, and is lazy.
describe("T-0301d AC-9 the engine is imported only by UF-01.4 and SaveScreen, both lazy", () => {
  const ENGINE = BANNED[0]![1];
  /** Every specifier a file imports, type-only and dynamic included. */
  function allSpecifiers(source: string): string[] {
    const out: string[] = [];
    const re = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) out.push(m[1]!);
    return out;
  }

  it("ScheduleScreen.tsx and SaveScreen.tsx are the only non-test UF-01 files naming the engine", () => {
    const sources = readdirSync(FEATURE_DIR).filter((f) => /\.tsx?$/.test(f));
    const importers = sources.filter((file) =>
      allSpecifiers(readFileSync(resolve(FEATURE_DIR, file), "utf8")).some((s) => ENGINE.test(s)),
    );
    expect(importers).toEqual(["SaveScreen.tsx", "ScheduleScreen.tsx"]);
  });

  it("the /welcome first chunk (index.tsx's static graph) reaches neither the engine nor UF-01.4", () => {
    const graph = staticGraph(resolve(FEATURE_DIR, "index.tsx"));
    expect(graph.filter(({ spec }) => ENGINE.test(spec))).toEqual([]);
    expect(graph.map((e) => e.spec)).not.toContain("./ScheduleScreen.js");
    expect(graph.map((e) => e.spec)).not.toContain("./PlanCard.js");
    expect(graph.map((e) => e.spec)).not.toContain("./SaveScreen.js");
  });

  it("contrast: UF-01.4's own graph does reach the engine (the walk is not vacuous)", () => {
    const graph = staticGraph(resolve(FEATURE_DIR, "ScheduleScreen.tsx"));
    expect(graph).toContainEqual({
      file: "features/UF-01/ScheduleScreen.tsx",
      spec: "@workoutlab/engine",
    });
    expect(graph.map((e) => e.spec)).toContain("./PlanCard.js");
  });

  it("UF-01.4 reaches no lib/offline or lib/profile, and lib/auth only via useAuth's module", () => {
    const graph = staticGraph(resolve(FEATURE_DIR, "ScheduleScreen.tsx"));
    expect(graph.filter(({ spec }) => /(^|\/)lib\/(offline|profile)(\/|$)/.test(spec))).toEqual([]);
    const authFromFeature = graph.filter(
      ({ file, spec }) => file.startsWith("features/") && /(^|\/)lib\/auth\//.test(spec),
    );
    expect(authFromFeature).toEqual([
      { file: "features/UF-01/ScheduleScreen.tsx", spec: "../../lib/auth/auth-context.js" },
    ]);
  });
});

describe("T-0301d AC-1 the plan card renders the engine's numbers as they are", () => {
  const schedule = readFileSync(resolve(FEATURE_DIR, "ScheduleScreen.tsx"), "utf8");
  const card = readFileSync(resolve(FEATURE_DIR, "PlanCard.tsx"), "utf8");

  it("deriveTargets is called once in UF-01.4 and once in SaveScreen, with priorityAreas: []", () => {
    const save = readFileSync(resolve(FEATURE_DIR, "SaveScreen.tsx"), "utf8");
    for (const source of [schedule, save]) {
      expect(source.match(/\bderiveTargets\(/g)).toHaveLength(1);
      expect(source).toMatch(/deriveTargets\(\{[^}]*priorityAreas:\s*\[\][^}]*\}\)/);
    }
    const others = readdirSync(FEATURE_DIR)
      .filter((f) => /\.tsx?$/.test(f) && f !== "ScheduleScreen.tsx" && f !== "SaveScreen.tsx")
      .filter((f) => readFileSync(resolve(FEATURE_DIR, f), "utf8").includes("deriveTargets("));
    expect(others).toEqual([]);
  });

  it("its result goes to the card's targets prop, which renders targets[area] untouched", () => {
    expect(schedule).toMatch(/const targets = deriveTargets\(/);
    expect(schedule).toMatch(/<PlanCard[^>]*\btargets=\{targets\}/);
    expect(card).toMatch(/targets: Readonly<Record<Area, number>>/);
    expect(card).toMatch(/AREAS\.map\(/);
    expect(card).toMatch(/\{String\(targets\[area\]\)\}/);
    // The only uses of `targets` in the card: the prop's type, its destructuring, the render.
    const uses = card.match(/\btargets\b[^,\n]*/g) ?? [];
    expect(uses.filter((u) => /targets\s*\[area\]\s*[-+*/%]|[-+*/%]\s*targets\b/.test(u))).toEqual(
      [],
    );
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

  it("the UF-01.1–.4 modules take their copy from en.uf01 only", () => {
    for (const file of [
      "WelcomeScreen.tsx",
      "GoalScreen.tsx",
      "LevelScreen.tsx",
      "StepHeader.tsx",
      "ScheduleScreen.tsx",
      "SaveScreen.tsx",
    ]) {
      const source = readFileSync(resolve(FEATURE_DIR, file), "utf8");
      const enUses = source.match(/(?<![\w./])en\.[a-zA-Z0-9]+/g) ?? [];
      expect(enUses.length, file).toBeGreaterThan(0);
      expect(new Set(enUses), file).toEqual(new Set(["en.uf01"]));
    }
  });

  it("the plan card takes its copy from en.uf01, and the 9 area names from en.bodyMap.areas", () => {
    // The area names are shared, never duplicated per flow (as UF-04 and UF-10 do).
    const source = readFileSync(resolve(FEATURE_DIR, "PlanCard.tsx"), "utf8");
    const enUses = source.match(/(?<![\w./])en\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)?/g) ?? [];
    expect(new Set(enUses.map((u) => (u.startsWith("en.uf01") ? "en.uf01" : u)))).toEqual(
      new Set(["en.uf01", "en.bodyMap.areas"]),
    );
  });
});

// T-0301c AC-5 (principle 3): `/welcome/save` writes the engine's numbers as they are.
describe("T-0301c AC-5 SaveScreen does no target arithmetic", () => {
  const save = readFileSync(resolve(FEATURE_DIR, "SaveScreen.tsx"), "utf8");

  it("each row's sets_per_14d is targets[area], untouched", () => {
    expect(save).toMatch(/const targets = deriveTargets\(/);
    expect(save).toMatch(/sets_per_14d:\s*targets\[area\],/);
    const uses = save.match(/\btargets\b[^,\n]*/g) ?? [];
    expect(uses.filter((u) => /targets\s*\[area\]\s*[-+*/%]|[-+*/%]\s*targets\b/.test(u))).toEqual(
      [],
    );
  });
});

// T-0301c AC-10 (D-0100 §5, D-0064 §7): `/welcome/save` never starts the onboarding clock.
describe("T-0301c AC-10 /welcome/save leaves the start time alone", () => {
  it("SaveScreen.tsx never names markOnboardingStarted", () => {
    const save = readFileSync(resolve(FEATURE_DIR, "SaveScreen.tsx"), "utf8");
    expect(save).not.toContain("markOnboardingStarted");
  });

  it("the splat's save route renders SaveScreen, not WelcomeScreen", () => {
    const routes = readFileSync(resolve(FEATURE_DIR, "WelcomeRoutes.tsx"), "utf8");
    const save = routes.match(/<Route\s+path="save"\s+element=\{<(\w+)[^}]*\}\s*\/>/);
    expect(save?.[1]).toBe("SaveScreen");
    // Contrast: the same match on the catch-all finds WelcomeScreen, so the pattern can see it.
    expect(routes.match(/<Route\s+path="\*"\s+element=\{<(\w+)[^}]*\}\s*\/>/)?.[1]).toBe(
      "WelcomeScreen",
    );
  });
});

// T-0301c AC-15 (NFR-I18N-1): UF-01.5 reads the auth texts from en.auth and its own from en.uf01.
describe("T-0301c AC-15 UF-01.5 strings", () => {
  it("AccountScreen.tsx and index.tsx take copy from en.uf01 and en.auth only (en.screens too)", () => {
    const account = readFileSync(resolve(FEATURE_DIR, "AccountScreen.tsx"), "utf8");
    const accountUses = new Set(account.match(/(?<![\w./])en\.[a-zA-Z0-9]+/g) ?? []);
    expect(accountUses).toEqual(new Set(["en.uf01", "en.auth"]));
    const index = readFileSync(resolve(FEATURE_DIR, "index.tsx"), "utf8");
    // `en.screens.authCallback` is T-0300b's existing callback heading.
    expect(new Set(index.match(/(?<![\w./])en\.[a-zA-Z0-9]+/g) ?? [])).toEqual(
      new Set(["en.auth", "en.uf01", "en.screens"]),
    );
  });

  it("no en.auth text is copied into flows/uf-01.ts", async () => {
    const { en } = await import("../../../lib/i18n/en.js");
    const flow = readFileSync(resolve(SRC, "lib/i18n/flows/uf-01.ts"), "utf8");
    for (const text of Object.values(en.auth)) expect(flow, text).not.toContain(`"${text}"`);
  });
});
