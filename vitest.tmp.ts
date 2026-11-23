// D-0159 / T-0441: vitest 5.0.2 writes module-transform copies to `<os.tmpdir()>/<nanoid>/{client,ssr}`
// and its core never removes that dir (index.*.js `Vitest._tmpDir`). Every package's vitest config
// calls both helpers below, so the dirs land under `<package>/node_modules/.vite/vitest-tmp/`
// (gitignored, on disk, not on the /tmp tmpfs) and are removed when the run ends.
// D-0271 / T-0934: each run owns a `<pid>-<startMs>` subfolder, so overlapping runs in one package
// never delete each other's files; subfolders of dead pids are pruned at the next start.
// Vitest resolves the config (this file runs) before it builds the core, so setting TMPDIR here is in time.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENV_KEY = "WL_VITEST_TMP_DIR";
let owner = false;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the pid exists but is not ours: alive. Only ESRCH proves it dead.
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Remove sibling run folders whose pid is gone (a crashed or killed run). Best effort. */
function pruneDeadRuns(parent: string, own: string): void {
  try {
    for (const name of readdirSync(parent)) {
      const match = /^(\d+)-\d+$/.exec(name);
      const path = join(parent, name);
      if (!match || path === own || pidAlive(Number(match[1]))) continue;
      rmSync(path, { recursive: true, force: true });
    }
  } catch {
    // best effort
  }
}

/** Point `os.tmpdir()` (and the forked workers' `TMPDIR`) at `<package>/node_modules/.vite/vitest-tmp`. */
export function redirectVitestTmp(configUrl: string): string {
  // D-0159 §5: vitest only. `vite dev`, `build` and `preview` load the same config and must not
  // redirect TMPDIR or own (and delete) the folder. Vitest sets VITEST=true before it loads the config.
  if (process.env.VITEST !== "true") return "";
  // A child process (for example the `vite build` that apps/web's build test spawns) loads the same
  // config and inherits this variable. It must neither re-redirect nor clean up the parent's folder.
  const inherited = process.env[ENV_KEY];
  if (inherited) return inherited;
  const parent = join(dirname(fileURLToPath(configUrl)), "node_modules", ".vite", "vitest-tmp");
  mkdirSync(parent, { recursive: true });
  const dir = join(parent, `${process.pid}-${Date.now()}`);
  pruneDeadRuns(parent, dir);
  mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = dir;
  process.env[ENV_KEY] = dir;
  owner = true;
  return dir;
}

/** Remove only this run's own subfolder when it ends, never the parent or a sibling run's. Never touches /tmp. */
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
