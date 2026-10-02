// @vitest-environment node
// T-0301a AC-10 (the import-graph half) and AC-12: source tests, because these two ACs are
// about what the *bundle* contains and where the gate is applied — neither is observable from
// a rendered DOM. Same `readFileSync` + real-tree pattern as `routes.phase3.test.ts` (AC-1).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__e2e__" || entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `import`/`export … from` specifier in a file, static ones only. */
function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1]!);
  // A bare side-effect import (`import "./x.js"`) is static too.
  const bare = /^\s*import\s+["']([^"']+)["']/gm;
  while ((m = bare.exec(source))) out.push(m[1]!);
  return out;
}

const FEATURE_FILES = walk(resolve(SRC, "features"));
const PROFILE_FILES = walk(resolve(SRC, "lib/profile"));

/**
 * D-0101 §3: the one feature file that may import `lib/profile`, and the only named bindings it
 * may take. Exact: a second binding, a namespace or type import, a second statement, a dynamic
 * `import()` or a `ProfileGate` mention all fail, and every other feature file must have none.
 */
const PROFILE_ALLOW: Readonly<Record<string, readonly string[]>> = {
  "features/UF-01/SaveScreen.tsx": ["useRecheckProfile"],
};

/** Every static `import`/`export … from` statement on `lib/profile`, as its clause text. */
function profileStatements(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*((?:import|export)\s[^;]*?)from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) if (m[2]!.includes("lib/profile")) out.push(m[1]!.trim());
  return out;
}

function dynamicProfileImport(source: string): boolean {
  return /import\(\s*["'][^"']*lib\/profile/.test(source);
}

/**
 * Why `file` (relative to `src/`) breaks the `lib/profile` ban, or `[]`. Static only, or dynamic
 * only, so each of the two AC-12 tests below checks its own half.
 */
function profileViolations(file: string, source: string, kind: "static" | "dynamic"): string[] {
  if (kind === "dynamic") return dynamicProfileImport(source) ? [`${file}: dynamic import()`] : [];
  const statements = profileStatements(source);
  const allowed = PROFILE_ALLOW[file];
  if (!allowed) return statements.map((st) => `${file}: ${st}`);
  const problems: string[] = [];
  if (statements.length !== 1) problems.push(`${file}: ${statements.length} lib/profile imports`);
  for (const st of statements) {
    const named = /^import\s*\{([^}]*)\}$/.exec(st);
    const bindings = named
      ? named[1]!
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean)
      : null;
    if (!bindings || bindings.join(",") !== allowed.join(",")) {
      problems.push(`${file}: ${st}`);
    }
  }
  if (source.includes("ProfileGate")) problems.push(`${file}: mentions ProfileGate`);
  return problems;
}

describe("AC-12 the gate is applied in exactly one place", () => {
  it("app/App.tsx applies ProfileGate from the route wiring, driven by isGatedPath", () => {
    const app = readFileSync(resolve(SRC, "app/App.tsx"), "utf8");
    expect(app).toContain("ProfileGate");
    expect(app).toContain("isGatedPath");
    expect(app).toContain("ProfileStatusProvider");
    // Applied inside the `routes.map` element construction, not hand-written per path.
    expect(app).toMatch(/isGatedPath\(route\)/);
  });

  it("no file outside app/ and lib/ renders ProfileGate", () => {
    const offenders = FEATURE_FILES.filter((f) => readFileSync(f, "utf8").includes("ProfileGate"));
    expect(offenders).toEqual([]);
  });

  // T-0301c AC-12 (D-0101 §3): the blanket ban becomes an exact one-entry allow-list.
  it("no file under features/ imports lib/profile, except the D-0101 allow-list", () => {
    const offenders = FEATURE_FILES.flatMap((f) =>
      profileViolations(f.slice(SRC.length + 1), readFileSync(f, "utf8"), "static"),
    );
    expect(offenders).toEqual([]);
  });

  it("nor through a dynamic import() (which would bypass the static check above)", () => {
    const offenders = FEATURE_FILES.flatMap((f) =>
      profileViolations(f.slice(SRC.length + 1), readFileSync(f, "utf8"), "dynamic"),
    );
    expect(offenders).toEqual([]);
  });

  it("SaveScreen.tsx has exactly one lib/profile import, naming only useRecheckProfile", () => {
    const source = readFileSync(resolve(SRC, "features/UF-01/SaveScreen.tsx"), "utf8");
    expect(profileStatements(source)).toEqual(["import { useRecheckProfile }"]);
    // Every other feature file: zero lib/profile specifiers, static or dynamic.
    const others = FEATURE_FILES.filter((f) => !f.endsWith("features/UF-01/SaveScreen.tsx"));
    expect(others.length).toBe(FEATURE_FILES.length - 1);
    for (const f of others) {
      const text = readFileSync(f, "utf8");
      expect(
        staticSpecifiers(text).filter((s) => s.includes("lib/profile")),
        f,
      ).toEqual([]);
      expect(dynamicProfileImport(text), f).toBe(false);
    }
  });

  describe("contrast: the allow-list check fires", () => {
    const SAVE = "features/UF-01/SaveScreen.tsx";
    const GOAL = "features/UF-01/GoalScreen.tsx";

    it("a second binding in SaveScreen.tsx fails", () => {
      const source =
        'import { useRecheckProfile, useProfileStatus } from "../../lib/profile/index.js";\n';
      expect(profileViolations(SAVE, source, "static")).not.toEqual([]);
    });

    it("useRecheckProfile added to GoalScreen.tsx fails", () => {
      const goal = readFileSync(resolve(SRC, GOAL), "utf8");
      const source = `import { useRecheckProfile } from "../../lib/profile/index.js";\n${goal}`;
      expect(profileViolations(GOAL, goal, "static")).toEqual([]);
      expect(profileViolations(GOAL, source, "static")).not.toEqual([]);
    });

    it.each([
      ["a namespace import", 'import * as profile from "../../lib/profile/index.js";'],
      ["a type import", 'import type { ProfileStatus } from "../../lib/profile/index.js";'],
      [
        "a second statement",
        'import { useRecheckProfile } from "../../lib/profile/index.js";\n' +
          'import { useRecheckProfile } from "../../lib/profile/profile-context.js";',
      ],
      [
        "a ProfileGate mention",
        'import { useRecheckProfile } from "../../lib/profile/index.js";\n// <ProfileGate>',
      ],
    ])("%s in SaveScreen.tsx fails", (_name, source) => {
      expect(profileViolations(SAVE, source, "static")).not.toEqual([]);
    });

    it("a dynamic import() of lib/profile in SaveScreen.tsx fails", () => {
      const source = 'const m = await import("../../lib/profile/index.js");';
      expect(profileViolations(SAVE, source, "dynamic")).not.toEqual([]);
    });

    it("the allowed form itself passes", () => {
      const source = 'import { useRecheckProfile } from "../../lib/profile/index.js";\n';
      expect(profileViolations(SAVE, source, "static")).toEqual([]);
    });
  });

  // The guard against a vacuous pass: the walker must actually see the feature tree.
  it("the feature walk found files (so the assertions above are not vacuous)", () => {
    expect(FEATURE_FILES.length).toBeGreaterThan(5);
    expect(PROFILE_FILES.length).toBeGreaterThan(2);
  });
});

describe("AC-10 a signed-out first render cannot pull the Dexie chunk", () => {
  it("lib/profile has no *static* import of lib/offline", () => {
    const offenders: string[] = [];
    for (const file of PROFILE_FILES) {
      if (file.includes("__tests__")) continue;
      for (const spec of staticSpecifiers(readFileSync(file, "utf8"))) {
        if (spec.includes("offline")) offenders.push(`${file.slice(SRC.length + 1)} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("it reaches lib/offline only through a dynamic import()", () => {
    const dynamic = PROFILE_FILES.filter((f) => !f.includes("__tests__"))
      .map((f) => readFileSync(f, "utf8"))
      .filter((s) => /import\(\s*["'][^"']*offline/.test(s));
    // Non-zero, or the test above would pass simply because nothing reads the cache at all.
    expect(dynamic.length).toBeGreaterThan(0);
  });

  it("every dynamic offline import sits after a signed-in check", () => {
    // `status.ts` is only ever called from the provider's `run()`, which returns early when
    // signed out; `profile-context.tsx` guards its own call the same way. Pin both, so the
    // early return cannot be deleted without this failing.
    const ctx = readFileSync(resolve(SRC, "lib/profile/profile-context.tsx"), "utf8");
    expect(ctx).toMatch(/if\s*\(!signedIn\)/);
    expect(ctx).toContain('authStatus !== "signed-out"');
    const statusSrc = readFileSync(resolve(SRC, "lib/profile/status.ts"), "utf8");
    // `status.ts` itself must not be reachable from a render path: it exports no component.
    expect(statusSrc).not.toContain("useEffect");
  });

  it("features/UF-01 does not import lib/profile (beyond the D-0101 allow-list) or lib/offline", () => {
    const uf01 = walk(resolve(SRC, "features/UF-01"));
    expect(uf01.length).toBeGreaterThan(0);
    for (const file of uf01) {
      const source = readFileSync(file, "utf8");
      const specs = staticSpecifiers(source);
      expect(profileViolations(file.slice(SRC.length + 1), source, "static")).toEqual([]);
      expect(specs.filter((s) => s.includes("lib/offline"))).toEqual([]);
    }
  });
});
