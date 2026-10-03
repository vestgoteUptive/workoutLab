// D-0159 / T-0441: vitest 5.0.2 writes module-transform copies to `<os.tmpdir()>/<nanoid>/{client,ssr}`
// and its core never removes that dir (index.*.js `Vitest._tmpDir`). Every package's vitest config
// calls both helpers below, so the dirs land under `<package>/node_modules/.vite/vitest-tmp/`
// (gitignored, on disk, not on the /tmp tmpfs) and are removed when the run ends.
// Vitest resolves the config (this file runs) before it builds the core, so setting TMPDIR here is in time.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_KEY = "WL_VITEST_TMP_DIR";
let owner = false;

/** Point `os.tmpdir()` (and the forked workers' `TMPDIR`) at `<package>/node_modules/.vite/vitest-tmp`. */
export function redirectVitestTmp(configUrl: string): string {
  // A child process (for example the `vite build` that apps/web's build test spawns) loads the same
  // config and inherits this variable. It must neither re-redirect nor clean up the parent's folder.
  const inherited = process.env[ENV_KEY];
  if (inherited) return inherited;
  const dir = join(dirname(fileURLToPath(configUrl)), "node_modules", ".vite", "vitest-tmp");
  mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = dir;
  process.env[ENV_KEY] = dir;
  owner = true;
  return dir;
}

/** Remove only this package's `vitest-tmp` folder when the run ends (one vitest per worktree). Never touches /tmp. */
export function cleanupVitestTmp(dir: string): void {
  if (!owner) return;
  process.once("exit", () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });
}
