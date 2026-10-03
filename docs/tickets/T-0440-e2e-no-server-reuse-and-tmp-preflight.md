---
id: T-0440
title: "e2e: playwright.config never reuses a server on :4173 (fail loudly instead of testing another worktree's build), and a nearly full tmpfs TMPDIR stops the run at config load with the fix in the message"
lane: qa
screens: []
decisions: [D-0155, D-0045]
deps: []
status: done
---
<!-- Written 2026-10-02 by product-owner (groom). From the 2026-10-02 journal: 53 false reds on main after T-0429 from a reused :4173, and 84 false reds from a full /tmp tmpfs (state.md traps). Build flow: wl-build-qa. About ¼ day. No app code changes. Parallel-safe with T-0436 by files. -->

## Why
- `tests/e2e/playwright.config.ts` has `reuseExistingServer: !process.env.CI`. A local run quietly
  tests whatever is listening on `:4173`, often another worktree's build. On 2026-10-02 that gave
  53 false reds on main ("Failed to fetch dynamically imported module"). A green run against the
  wrong build would be worse, and just as quiet.
- On this machine `/tmp` is a RAM tmpfs. At about 80 % full, Chromium fails every page
  (`ERR_INSUFFICIENT_RESOURCES`, `Target crashed`), which gave 84 false reds. The fix
  (`TMPDIR=$HOME/.cache/wl-pw-tmp`) is only in `state.md` and `_common.md`.
- Both failures cost a triage round each time, because nothing names the cause. D-0155 §5–§6: fail
  once, early, and say why.

## Scope
- In:
  - `playwright.config.ts`:
    - `webServer.reuseExistingServer: false`, in CI and locally (D-0155 §5).
    - At load, call the preflight from `fixtures/preflight.ts` on `os.tmpdir()` and throw its
      message if there is one (D-0155 §6).
    - The header comment documents both traps in two or three lines: the port rule and the
      `TMPDIR` fix.
    - Everything else stays the same: the `webServer.command` string, `retries: 0`, `PORT`,
      `BASE_URL` and the `VITE_SUPABASE_URL` export that the fixtures import.
  - A new `fixtures/preflight.ts`, with two exports:
    - a pure `tmpdirProblem(stat, dir): string | null`, taking `{type, blocks, bavail}`;
    - `checkTmpdir(dir?, statfs?)`, which calls `fs.statfsSync` and returns `null` if it throws.
  - A new `e2e-config.spec.ts`, importing `test`/`expect` from `./fixtures/guarded-test.js` (so
    T-0432's later check finds it guarded). No page is needed.
- Out:
  - Setting `TMPDIR` from the config (D-0155 §6 says no).
  - A served-build-id check (D-0155 §5 says no).
  - `.github/**`, including `check-e2e-wiring.mjs`. That is the infra lane. Its existing rules must
    stay green (AC-4).
  - `apps/landing/browser/playwright.config.ts`, which has the same `reuseExistingServer` line.
    That is the landing lane's follow-up.
  - `fixtures/guarded-test.ts`, `fixtures/supabase-mock.ts`, `fixtures/source-rules.ts` and
    `fixture-guard.spec.ts` (T-0436).

## Acceptance criteria
Test titles start with `T-0440 ACn`.
- **AC-1 (no reuse; red on main)** Given the default export of `./playwright.config.js`, its
  `webServer.reuseExistingServer` is exactly `false`, and the config source sets it to the literal
  `false`, not to an expression on `CI`. On main, with `CI` unset, it is `true`; record that red
  run. The same test checks that
  `apps/web/package.json`'s `preview` script holds `--port 4173` and `--strictPort`, and that the
  config's `BASE_URL` port is 4173.
- **AC-2 (the loud failure, recorded in the build log)** Given a stand-in server on `:4173` (for
  example `node -e "require('http').createServer((q,s)=>s.end('x')).listen(4173)"`), when
  `pnpm --filter @workoutlab/web test:e2e` runs under the test lock, then it exits non-zero
  before any test runs. Its output contains `is already used`, and no build starts.
  - **The contrast.** On main the same setup runs the tests against the stand-in.
  - **The pair.** With the port free, the whole suite runs and passes (AC-6).
  - This can't be an automated test, because a nested run would fight this one over the port.
- **AC-3 (the tmpfs preflight, D-0155 §6)** `tmpdirProblem` with `dir` `"/tmp"`:
  - **Fails.** `{type: 0x01021994, blocks: 100, bavail: 20}` (80 % used) returns a string that
    contains `/tmp`, `80%` and `TMPDIR=$HOME/.cache/wl-pw-tmp`.
  - **Just under.** `bavail: 21` (79 %) returns `null`.
  - **Not tmpfs.** `type: 0xef53` (ext4) at 95 % used returns `null`.
  - **Empty.** `blocks: 0` returns `null` (no divide by zero).
  - **No statfs.** `checkTmpdir("/x", () => { throw new Error("ENOSYS") })` returns `null`.
- **AC-4 (wiring)**
  - **The config calls it.** A source assertion finds that `playwright.config.ts` imports from
    `./fixtures/preflight.js` and calls it at module top level, outside `defineConfig`.
  - **Planted fault, recorded.** Temporarily set the threshold to 0 %. On this machine's tmpfs
    `/tmp`, `test:e2e` then stops at config load with the message and runs no test. Revert it.
  - **The pair.** With `TMPDIR` on disk, the config loads.
  - **Repo checks.** `node .github/scripts/check-e2e-wiring.mjs` and
    `node --test .github/scripts/check-e2e-wiring.test.mjs` stay green, unedited.
- **AC-5 (nothing else moved)** The AC-1 test also pins, as literals: `retries` 0,
  `webServer.command` (the turbo build, then `preview`), `webServer.url` `BASE_URL`,
  `webServer.env` `{VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY:
  "e2e-fake-anon-key"}`, and the one `chromium` project. Under CI, `reuseExistingServer` was
  already `false`, and a disk-backed `/tmp` passes the preflight, so CI behaviour doesn't change.
- **AC-6 (the suite)** `pnpm --filter @workoutlab/web test:e2e` passes in full, with no other run
  holding `:4173`.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`), in practice `playwright.config.ts`, `fixtures/preflight.ts`
  (new) and `e2e-config.spec.ts` (new).
- **Listed extras:**
  - `docs/tickets/T-0440-e2e-no-server-reuse-and-tmp-preflight.md`: this file, for the build and accept logs.

## Contract impact
None. Test infrastructure only.

## Coordination
- **With T-0436, allowed in parallel.** T-0436 edits `fixtures/guarded-test.ts`,
  `fixtures/supabase-mock.ts`, `fixtures/source-rules.ts`, `fixture-guard.spec.ts` and the specs
  its inventory names. This ticket edits none of those, and T-0436 doesn't edit the config. Both
  run e2e under the machine lock, so their runs are serial anyway. Whichever lands second merges
  `main` and reruns the whole suite.
- **With every app ticket, allowed.** Once this lands, a local e2e run on a busy `:4173` fails at
  once with "is already used". That is the `_common.md` "wait and rerun" case, and it is no longer
  a silent wrong-build run. The orchestrator can then shorten the two `state.md` traps.

## Definition of done
Tests for every AC pass, with the red run, the loud-failure run and the planted fault recorded ·
`pnpm -w typecheck lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web
test:e2e` green (the whole suite) · `format:check` and `check:repo` green · contracts unchanged ·
commits start `T-0440` (for example `T-0440: never reuse a server on :4173`).

## Build log
2026-10-02, qa (wl-build-qa). All runs use `flock /tmp/workoutlab-tests.lock` and, unless noted,
`TMPDIR=$HOME/.cache/wl-pw-tmp`. `/tmp` was a tmpfs at 44 % during the build.

- **Files.** `tests/e2e/playwright.config.ts` (`reuseExistingServer: false`, a top-level
  `checkTmpdir()` call that throws its message, and the header comment on both traps),
  `tests/e2e/fixtures/preflight.ts` (new: `tmpdirProblem`, `checkTmpdir`), and
  `tests/e2e/e2e-config.spec.ts` (new, imports `test`/`expect` from `./fixtures/guarded-test.js`).
  `webServer.command`, `retries: 0`, `PORT`, `BASE_URL` and the `VITE_SUPABASE_URL` export are
  unchanged.
- **AC-1 red, recorded.** I wrote the spec before changing the config. `test:e2e e2e-config.spec.ts`
  on the main config gave 2 failed and 7 passed: AC1 (`reuseExistingServer`: Expected `false`,
  Received `true`, with `CI` unset) and AC4 (no preflight import). After the change, 9 of 9 passed.
- **AC-2 contrast (main config).** With a stand-in on :4173
  (`node -e "require('http').createServer((q,s)=>s.end('x')).listen(4173)"`),
  `test:e2e sw-registration.spec.ts` started no build. It ran both tests against the stand-in, and
  both failed on `[data-screen-id="UF-01.1"]` not visible: the silent wrong-server run.
- **AC-2 loud failure (new config).** With the same stand-in, `test:e2e` (the whole suite) exited 1
  at once with `Error: http://localhost:4173 is already used, make sure that nothing is running on
  the port/url or set reuseExistingServer:true in config.webServer.` No turbo build started and no
  test ran.
- **AC-4 planted fault, recorded and reverted.** I set `TMPFS_MAX_USED_PERCENT` to 0. With
  `TMPDIR` unset (`/tmp` tmpfs), `test:e2e` stopped at config load
  (`playwright.config.ts:13`) with `e2e preflight (T-0440, D-0155 §6): the temp dir /tmp is a
  tmpfs and 44% full (the limit is 0%). … TMPDIR=$HOME/.cache/wl-pw-tmp …`. No build started and no
  test ran.
  - **The pair.** With the fault still planted and `TMPDIR=$HOME/.cache/wl-pw-tmp` (ext4), the
    config loaded and the spec ran. 8 passed, and the AC3 79 % test failed, as it should under a
    0 % threshold.
  - I reverted the threshold to 80.
- **AC-4 repo checks.** `node .github/scripts/check-e2e-wiring.mjs` exited 0, and
  `node --test .github/scripts/check-e2e-wiring.test.mjs` gave 14 of 14 passed. `.github/**` is
  unedited.
- **AC-6 / gate.**
  - `pnpm --filter @workoutlab/web test:e2e`: 152 passed, with :4173 free.
  - `pnpm -w typecheck lint test --force --concurrency=1`: 19 of 19 turbo tasks passed.
  - `pnpm -w test:repo-checks`: 146 of 146 passed.
  - `pnpm -w format:check`: clean.
  - `node .github/scripts/check-all.mjs`: exit 0.

## QA log
2026-10-02, qa. I merged `main` (64a49ec) and the tree was clean. Every run used `flock`, and `TMPDIR=$HOME/.cache/wl-pw-tmp` unless noted. `/tmp` was a tmpfs at 48 %.
- **AC-1 red.** I swapped in main's config, and `e2e-config.spec.ts` gave 2 failed and 7 passed (AC1: Expected `false`, Received `true`; AC4: no preflight import). I then restored the config.
- **AC-2.** With `python3 -m http.server 4173` running, `test:e2e` exited 1 after 3 s with `http://localhost:4173 is already used`. No build started and no test ran. I then stopped the stand-in.
- **AC-3/AC-5.** Both are covered by spec tests, and they pass.
- **AC-4.** With the threshold planted at 0 and `TMPDIR` unset, the run stopped at `playwright.config.ts:13` with the preflight message (48 %) and ran no test. The pair (`TMPDIR` on disk) loaded the config: 8 passed, and the 79 % test failed, as it should. I restored the file from a backup. `check-e2e-wiring` exited 0, and its tests gave 14 of 14.
- **Gate.** e2e 152/152 passed. `typecheck lint test --force --concurrency=1`: 19/19. `test:repo-checks`: 146/146. `format:check` was clean, and `check-all` exited 0. Verdict: pass.

## Accept log
2026-10-03, product-owner (accept). Branch at 85bc83d (main merged). Verdict: **done**.
- AC-1 → `T-0440 AC1 never reuses a server…` (literal `false`, `--strictPort`, port 4173). Red on main's config, recorded in the build and QA logs.
- AC-2 → manual and recorded: loud exit 1 with `is already used` and no build (build log with the node stand-in, QA log with a python one). The main-config contrast is in the build log.
- AC-3 → the five `T-0440 AC3` tests (80 %, 79 %, ext4 at 95 %, blocks 0, statfs throws), plus a pass-through test.
- AC-4 → `T-0440 AC4 …top level, outside defineConfig`. Planted threshold 0 stopped the run at config load and the on-disk `TMPDIR` pair loaded the config (both recorded). `check-e2e-wiring` 0 and 14/14, `.github/**` unedited.
- AC-5 → `T-0440 AC5 nothing else in the config moved`.
- AC-6 → e2e 152/152 with :4173 free (QA).
- D-0155 §5–§6 hold: no `TMPDIR` set by the config, no build-id check, and the header comment documents both traps. No contract changed, and no app code changed.
- Follow-up still open: `apps/landing/browser/playwright.config.ts` has the same `reuseExistingServer` line (landing lane).
