---
id: D-0159
title: "Vitest module-transform temp dirs: redirect them to a gitignored per-package cache dir, remove them when the run ends, and guard both with a repo check; no pool change, no vitest downgrade"
status: revisit
date: 2026-10-03
by: product-owner (groom T-0441)
area: infra
builds-on: D-0155 §6, D-0157 §7, D-0158
---
## Context
Every `vitest run` on this machine leaves a `/tmp/<21-char nanoid>/{client,ssr}` dir of transformed
modules (about 12 MB each, about 120 an hour across worktrees). On 2026-10-02 they reached 3 GB and
filled the `/tmp` tmpfs: `EDQUOT`, then Chromium `ERR_INSUFFICIENT_RESOURCES` in e2e.

A read of vitest 5.0.2 (`dist/chunks/index.*.js`) during grooming points at the cause:
- `TestProject` sets `tmpDir = join(tmpdir(), nanoid())` and removes it in `close()` (`clearTmpDir`).
- The `Vitest` core sets `_tmpDir = join(tmpdir(), nanoid())` too and hands it to its own module
  fetcher. Nothing removes it.
- The fetcher writes `<tmpDir>/<environment>/<sha1>` copies when `makeTmpCopies` is on (the forks
  pool, our default) and the fs module cache is off.

The builder confirms this by counting dirs (T-0441 AC-1). This is a hypothesis, not a finding.

## Decision
1. **Fix at the source we control, not in vitest.** Don't patch `node_modules`, don't downgrade
   vitest, and don't change `pool`. Switching to threads changes how jsdom and module state are
   isolated, and that is a different risk. A vitest patch release that fixes the leak is
   acceptable only if it is a lockfile-only bump and AC-2 passes.
2. **Where the dirs go.** Each package's vitest temp dir lives under that package's
   `node_modules/.vite/vitest-tmp/`. That path is already gitignored (`node_modules/`), sits on
   disk rather than tmpfs, and Vite's cache already lives there. The builder picks the mechanism:
   `TMPDIR` set in the config before vitest reads it, the `test` script env, or a vitest option if
   5.0.2 has one. It records why in the build log. The mechanism must also work under
   `vitest run <file>` and `vitest related`, not only `pnpm test`.
3. **Clean up as well as redirect.** Moving the leak onto disk is not enough: about 1.4 GB an hour
   would pile up instead. The run removes its own temp dirs when it ends, for example in a
   `globalSetup` teardown. It removes only the run's own dir, or the whole `vitest-tmp/` folder
   (only one vitest runs per worktree, `_common.md`). It never touches `/tmp` globs, because other
   worktrees' live runs are there.
4. **Guard.** A repo check under `.github/scripts/` fails when a package whose `test` script runs
   vitest lacks the redirect or cleanup. A `node --test` behaviour test runs one small vitest
   package with `TMPDIR` set to a fresh scratch dir and asserts that nothing new is left there.
   Counting `/tmp` is not an acceptable test, because parallel worktrees make it flaky.
5. The machine lock `/tmp/workoutlab-tests.lock` and the e2e `TMPDIR=$HOME/.cache/wl-pw-tmp` rule
   stay. This decision covers vitest only.

## Consequences
- `/tmp` stops growing from unit-test runs, and the e2e `ERR_INSUFFICIENT_RESOURCES` false reds
  lose their main cause. The orchestrator can then shorten the `/tmp` notes in `state.md` and
  `agents/roles/_common.md`.
- Revisit if a vitest upgrade fixes the leak upstream. The guard then checks for the version
  instead.
