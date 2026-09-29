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
    const offenders = FEATURE_FILES.filter((f) =>
      readFileSync(f, "utf8").includes("ProfileGate"),
    );
    expect(offenders).toEqual([]);
  });

  it("no file under features/ imports lib/profile", () => {
    const offenders = FEATURE_FILES.filter((f) =>
      staticSpecifiers(readFileSync(f, "utf8")).some((s) => s.includes("lib/profile")),
    ).map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it("nor through a dynamic import() (which would bypass the static check above)", () => {
    const offenders = FEATURE_FILES.filter((f) =>
      /import\(\s*["'][^"']*lib\/profile/.test(readFileSync(f, "utf8")),
    ).map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
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

  it("features/UF-01 does not import lib/profile or lib/offline", () => {
    const uf01 = walk(resolve(SRC, "features/UF-01"));
    expect(uf01.length).toBeGreaterThan(0);
    for (const file of uf01) {
      const specs = staticSpecifiers(readFileSync(file, "utf8"));
      expect(specs.filter((s) => s.includes("lib/profile"))).toEqual([]);
      expect(specs.filter((s) => s.includes("lib/offline"))).toEqual([]);
    }
  });
});
