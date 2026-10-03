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

## Build / accept log
Archived in `docs/tickets/log/T-0440.md` (D-0157).
