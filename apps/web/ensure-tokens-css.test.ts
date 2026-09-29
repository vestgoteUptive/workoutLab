// @vitest-environment node
// T-0312: `pnpm --filter @workoutlab/web test` must work on a clean clone, where
// packages/design-tokens/dist/tokens.css has never been built (turbo's `^build` is skipped).
// The fixture tests copy the real tokens package into a temp dir and delete its dist, which
// is the original reproduction, without touching the dist the rest of the suite reads.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureTokensCss, findTokensPackage } from "./ensure-tokens-css.mjs";

const webRoot = dirname(fileURLToPath(import.meta.url));
const tokensRoot = resolve(webRoot, "../../packages/design-tokens");

describe("apps/web pretest wiring (T-0312)", () => {
  it("the test script is preceded by the tokens pretest", () => {
    const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.pretest).toBe("node ensure-tokens-css.mjs");
    expect(pkg.scripts.test).toBe("vitest run");
  });

  it("resolves the workspace design-tokens package", () => {
    expect(findTokensPackage(webRoot)).toBe(tokensRoot);
  });
});

describe("ensureTokensCss on a copy of the tokens package (T-0312)", () => {
  let pkgRoot: string;
  let cssPath: string;

  beforeEach(() => {
    pkgRoot = mkdtempSync(join(tmpdir(), "wl-ensure-tokens-"));
    for (const rel of ["package.json", "src/tokens.json", "scripts"]) {
      cpSync(join(tokensRoot, rel), join(pkgRoot, rel), { recursive: true });
    }
    cssPath = join(pkgRoot, "dist/tokens.css");
    expect(existsSync(cssPath)).toBe(false);
  });

  afterEach(() => {
    rmSync(pkgRoot, { recursive: true, force: true });
  });

  it("builds dist/tokens.css when dist is missing", () => {
    const res = ensureTokensCss(pkgRoot);
    expect(res).toEqual({ built: true, cssPath });
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/--wl-color-bg\s*:/);
    expect(css).toMatch(/--wl-color-coverage-4\s*:/);
  });

  it("works in a fresh node process (as `pnpm run pretest` runs it), from a clean dist", () => {
    const script = `import { ensureTokensCss } from ${JSON.stringify(
      join(webRoot, "ensure-tokens-css.mjs"),
    )}; ensureTokensCss(${JSON.stringify(pkgRoot)});`;
    const res = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(existsSync(cssPath)).toBe(true);
  });

  it("does not rewrite an up-to-date file (no race with concurrent readers under turbo)", () => {
    ensureTokensCss(pkgRoot);
    const future = new Date(Date.now() + 60_000);
    utimesSync(cssPath, future, future);
    const before = statSync(cssPath).mtimeMs;
    expect(ensureTokensCss(pkgRoot)).toEqual({ built: false, cssPath });
    expect(statSync(cssPath).mtimeMs).toBe(before);
  });

  it("rebuilds when tokens.json is newer than the CSS", () => {
    ensureTokensCss(pkgRoot);
    const old = new Date(Date.now() - 60_000);
    utimesSync(cssPath, old, old);
    expect(ensureTokensCss(pkgRoot).built).toBe(true);
    expect(statSync(cssPath).mtimeMs).toBeGreaterThan(old.getTime());
  });

  it("rebuilds when the build script is newer than the CSS", () => {
    ensureTokensCss(pkgRoot);
    const old = new Date(Date.now() - 60_000);
    utimesSync(cssPath, old, old);
    const now = new Date();
    utimesSync(join(pkgRoot, "src/tokens.json"), old, old);
    utimesSync(join(pkgRoot, "scripts/build-css.mjs"), now, now);
    expect(ensureTokensCss(pkgRoot).built).toBe(true);
  });

  it("fails loudly when the build does not produce the CSS", () => {
    const pkgJson = join(pkgRoot, "package.json");
    const pkg = JSON.parse(readFileSync(pkgJson, "utf8")) as { scripts: Record<string, string> };
    pkg.scripts.build = "node -e 0";
    writeFileSync(pkgJson, JSON.stringify(pkg));
    expect(() => ensureTokensCss(pkgRoot)).toThrow(/did not produce .*dist\/tokens\.css/);
  });
});
