// T-0440 (D-0155 §6): a preflight that `playwright.config.ts` runs at load. On a machine where
// the temp dir is a RAM tmpfs, Chromium starts failing every page (`ERR_INSUFFICIENT_RESOURCES`,
// `Target crashed`) once it is about 80 % full, and the run then shows dozens of false reds that
// name nothing. This stops the run once, before any build or test, and says how to fix it.
// It never sets `TMPDIR` itself (D-0155 §6): the fix is the caller's to choose.
import { execFileSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { tmpdir } from "node:os";

/** `statfs` `f_type` for tmpfs (linux/magic.h `TMPFS_MAGIC`). */
export const TMPFS_MAGIC = 0x01021994;

/** The used share, in percent, at which a tmpfs temp dir stops the run. */
export const TMPFS_MAX_USED_PERCENT = 80;

/** The disk-backed temp dir the message points at (state.md, `_common.md`). */
export const TMPDIR_FIX = "TMPDIR=$HOME/.cache/wl-pw-tmp";

/** The `statfs` fields the check reads. */
export interface TmpdirStat {
  type: number;
  blocks: number;
  bavail: number;
}

/**
 * Returns why `dir` is unsafe for a Playwright run, or `null` if it is fine. Only a tmpfs counts:
 * a disk-backed dir never stops the run, however full. `blocks: 0` (an empty or odd fs) is fine.
 */
export function tmpdirProblem(stat: TmpdirStat, dir: string): string | null {
  if (stat.type !== TMPFS_MAGIC) return null;
  if (!(stat.blocks > 0)) return null;
  const used = stat.blocks - stat.bavail;
  // Integer comparison, so 79.999… never rounds up into a stop.
  if (used * 100 < TMPFS_MAX_USED_PERCENT * stat.blocks) return null;
  const percent = Math.floor((used * 100) / stat.blocks);
  return (
    `e2e preflight (T-0440, D-0155 §6): the temp dir ${dir} is a tmpfs and ${percent}% full ` +
    `(the limit is ${TMPFS_MAX_USED_PERCENT}%). Chromium would fail every page with ` +
    `ERR_INSUFFICIENT_RESOURCES or "Target crashed". Rerun with a disk-backed temp dir: ` +
    `mkdir -p "$HOME/.cache/wl-pw-tmp" && ${TMPDIR_FIX} <your playwright command>.`
  );
}

/**
 * Runs `tmpdirProblem` on `dir` (default `os.tmpdir()`, which follows `TMPDIR`). If `statfs`
 * throws (no such dir, or a platform without it), it returns `null`: the preflight never blocks a
 * run it can't measure.
 */
export function checkTmpdir(
  dir: string = tmpdir(),
  statfs: (path: string) => TmpdirStat = statfsSync,
): string | null {
  let stat: TmpdirStat;
  try {
    stat = statfs(dir);
  } catch {
    return null;
  }
  return tmpdirProblem(stat, dir);
}

// T-0984: a second Playwright run in the same worktree used to wipe the first run's `test-results/`.
// Playwright empties the output dir before it starts the web server, and only then finds :4173
// busy and stops. Every in-flight test that reads back a file it wrote there (canvas-compare AC1
// reads the PNGs, AC5 checks `today-app.png`) then fails with ENOENT, with no hint of the cause.
// The config runs this at load, which is before Playwright cleans anything, so the second run
// stops with the same message and leaves the first run's files alone.

/** True when something accepts connections on `port`, on IPv4 or IPv6 loopback. Synchronous. */
export function portInUse(port: number): boolean {
  const probe =
    `const net=require("net");let left=2,busy=false;` +
    `for(const h of ["127.0.0.1","::1"]){const s=net.connect({port:${port},host:h});` +
    `s.on("connect",()=>{busy=true;s.destroy()});s.on("error",()=>{});` +
    `s.on("close",()=>{if(--left===0)process.exit(busy?1:0)})}`;
  try {
    execFileSync(process.execPath, ["-e", probe], { stdio: "ignore", timeout: 10_000 });
    return false;
  } catch (e) {
    return (e as { status?: number | null }).status === 1;
  }
}

/**
 * Why this run must not start, or `null`. A worker loads the config too, while this run's own
 * server is up, so only the main process (no `TEST_WORKER_INDEX`) checks.
 */
export function checkPortFree(
  port: number,
  inUse: (port: number) => boolean = portInUse,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.TEST_WORKER_INDEX !== undefined) return null;
  if (!inUse(port)) return null;
  return (
    `e2e preflight (T-0984): port ${port} is already used, so another Playwright run is going ` +
    `(or a preview server is left over). Starting now would empty test-results/ under that run ` +
    `and fail its tests with ENOENT. Wait for it to finish, then rerun.`
  );
}
