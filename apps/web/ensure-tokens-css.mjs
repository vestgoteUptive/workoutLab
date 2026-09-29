#!/usr/bin/env node
// T-0312: `pretest` for @workoutlab/web. `src/main.tsx` imports
// `@workoutlab/design-tokens/tokens.css`, which is exported from the gitignored, generated
// `dist/tokens.css`. `turbo run test` builds it first (`dependsOn: ["^build"]`), but
// `pnpm --filter @workoutlab/web test` does not, so build.test.ts failed on a clean clone.
//
// This runs the tokens package's own `build` script when its CSS is missing or older than its
// inputs, and does nothing otherwise. Under turbo the `^build` output is always fresh, so this
// never rewrites the file another package's test (e.g. landing's `astro build`) may be reading.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import console from "node:console";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TOKENS_PKG = "@workoutlab/design-tokens";

/** Root of the design-tokens package as resolved from `fromDir` (the workspace link). */
export function findTokensPackage(fromDir) {
  const require = createRequire(resolve(fromDir, "package.json"));
  let dir = dirname(require.resolve(`${TOKENS_PKG}/tokens.json`));
  for (;;) {
    const pkgJson = join(dir, "package.json");
    if (existsSync(pkgJson) && JSON.parse(readFileSync(pkgJson, "utf8")).name === TOKENS_PKG) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not find the ${TOKENS_PKG} package root`);
    dir = parent;
  }
}

function newestMtime(paths) {
  let newest = 0;
  for (const p of paths) {
    const st = statSync(p);
    if (st.isDirectory()) {
      newest = Math.max(newest, newestMtime(readdirSync(p).map((name) => join(p, name))));
    } else {
      newest = Math.max(newest, st.mtimeMs);
    }
  }
  return newest;
}

/**
 * Make sure `<pkgRoot>/<exports["./tokens.css"]>` exists and is not older than
 * `exports["./tokens.json"]` or anything in `scripts/`. Returns whether a build ran.
 */
export function ensureTokensCss(pkgRoot) {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  const cssPath = resolve(pkgRoot, pkg.exports["./tokens.css"]);
  const inputs = [resolve(pkgRoot, pkg.exports["./tokens.json"])];
  if (existsSync(join(pkgRoot, "scripts"))) inputs.push(join(pkgRoot, "scripts"));

  if (existsSync(cssPath) && statSync(cssPath).mtimeMs >= newestMtime(inputs)) {
    return { built: false, cssPath };
  }
  const res = spawnSync(pkg.scripts.build, { cwd: pkgRoot, shell: true, stdio: "inherit" });
  if (res.status !== 0 || !existsSync(cssPath)) {
    throw new Error(`${TOKENS_PKG} build did not produce ${cssPath} (exit ${res.status})`);
  }
  return { built: true, cssPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webRoot = dirname(fileURLToPath(import.meta.url));
  const { built, cssPath } = ensureTokensCss(findTokensPackage(webRoot));
  if (built) console.log(`ensure-tokens-css: built ${cssPath}`);
}
