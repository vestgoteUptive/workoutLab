// T-0440 (D-0155 §6): a preflight that `playwright.config.ts` runs at load. On a machine where
// the temp dir is a RAM tmpfs, Chromium starts failing every page (`ERR_INSUFFICIENT_RESOURCES`,
// `Target crashed`) once it is about 80 % full, and the run then shows dozens of false reds that
// name nothing. This stops the run once, before any build or test, and says how to fix it.
// It never sets `TMPDIR` itself (D-0155 §6): the fix is the caller's to choose.
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
