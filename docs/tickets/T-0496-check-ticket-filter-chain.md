---
id: T-0496
title: "check-all: fail when a ticket names a pnpm --filter command with more than one script (the T-0490 anti-pattern)"
lane: infra
screens: []
decisions: [D-0023, D-0032, D-0180]
deps: [T-0490]
status: ready
groomed: 2026-10-05
---
<!-- Written by product-owner 2026-10-05 (groom mode, D-0180 §4). Build flow: wl-build-infra.
About 1-2 hours. One new check script and its node:test file, wired into check-all. This ticket
file describes the bad form in words on purpose, so the new check doesn't flag it. -->

## Why
T-0490 found that a ticket line naming one `pnpm --filter <pkg>` command followed by several
script names (typecheck, then lint, then test, all in one command) runs only the first script;
pnpm passes the rest to it as arguments, so a builder following the ticket can report green
without running lint or tests. T-0490 fixed 14 tickets by hand and added a note to
`docs/tickets/_template.md`. Nothing stops the idiom coming back the next time a ticket is
copied from an old one. A repo-hygiene check (D-0023 family, like D-0032's stale wording) makes
it mechanical.

## Scope
- In:
  - New `.github/scripts/check-ticket-filter-chain.mjs`, shaped like `check-stale-wording.mjs`:
    a pure `checkFilterChain(files)` over `{ path, content }` returning findings
    `{ path, line, rule: "ticket-filter-chain", message }`, and `runCheck(root = REPO_ROOT)` that
    loads `docs/tickets/*.md` (**top level only**: not `docs/tickets/log/**`, whose logs record
    what was really run) and calls it. Node built-ins only (D-0023 rule 5).
  - The pattern is T-0490's audit regex (ERE, case-sensitive):
    `pnpm(@[0-9.]+)? +(--filter|-F)[ =]+[^ ]+ +(typecheck|lint|test|build)( +(typecheck|lint|test|build))+`.
    Also catch a command wrapped across one line break: test each line joined to the next with a
    single space, and report a match once, at the line where its `pnpm` token is.
  - One exemption, by exact path: `docs/tickets/T-0490-ticket-filter-one-script-per-command.md`
    (it quotes the bad form as the thing it fixed). A named constant with a one-line reason. No
    inline opt-out marker.
  - `.github/scripts/check-all.mjs`: import it as `runFilterChain` and spread its findings into
    `runAll`.
  - `.github/scripts/check-all.test.mjs`: add the new pair to the `SUBCHECKS` list of the T-0320
    AC-10 source test (and update that test's "six" title to the real count).
  - New `.github/scripts/check-ticket-filter-chain.test.mjs` (node:test).
- Out:
  - The workspace-root form with `-w` (turbo takes several task names; T-0444's scope). The regex
    already doesn't match it, because `-w` isn't `--filter`/`-F`. Pin that in a test (AC-3).
  - `agents/roles/**`, `.claude/**`, `.squad/**`, `docs/specs/**`, README.
  - Any ticket text: if the real-repo run finds a match outside the exempt file, list it in the
    handback for the product lane rather than editing a ticket.

## Acceptance criteria
**Test rules.** `node:test` in `check-ticket-filter-chain.test.mjs`, titles start "T-0496 AC-n".
Fixture strings are built in the test file, so they don't live under `docs/tickets/`.
- **AC-1 (one line)** Given a file `docs/tickets/T-9999-x.md` whose line 3 is a backticked
  pnpm-filter command for `@workoutlab/engine` followed by `typecheck lint test`, Then exactly
  one finding: line 3, rule `ticket-filter-chain`. Same for the `npx -y pnpm@10.28.2` prefix, for
  `-F` instead of `--filter`, and for `--filter=@workoutlab/web`.
- **AC-2 (wrapped)** Given line 7 ending `… --filter @workoutlab/web` and line 8 starting
  `typecheck lint` (T-0426's old shape), Then one finding at line 7. Given line 7 ending
  `… --filter @workoutlab/web typecheck` and line 8 starting `lint test`, Then one finding at
  line 7. A single-script command on one line is never reported twice.
- **AC-3 (allowed forms, no finding)** No finding for: three separate backticked per-package
  commands (typecheck, lint, test each on its own); `pnpm -w typecheck lint test`; a filter
  command with one script then `-- --run x`; T-0440's wrap (`… --filter @workoutlab/web` then
  next line `test:e2e` green); `_template.md`'s current note.
- **AC-4 (scope)** Given `runCheck(tmpRoot)` on a temp tree with the bad form in
  `docs/tickets/T-1-a.md`, in `docs/tickets/log/T-1.md` and in
  `docs/tickets/T-0490-ticket-filter-one-script-per-command.md`, Then exactly one finding, for
  `T-1-a.md`.
- **AC-5 (wired)** `check-all.test.mjs`'s source test lists the new check, and
  `node .github/scripts/check-all.mjs` exits 0 on the real repo. Planted fault: create a scratch
  `docs/tickets/T-9998-fault.md` holding the bad form; `check-all.mjs` exits 1 naming that file
  and the rule; delete the scratch file and it exits 0 again. Record both runs.
- **AC-6 (fault proof for the wrap)** On a backup copy of the check, drop the line-join step:
  AC-2 goes red. Restore with `cp`.

## Paths you may change
- `.github/scripts/check-ticket-filter-chain.mjs` (new)
- `.github/scripts/check-ticket-filter-chain.test.mjs` (new)
- `.github/scripts/check-all.mjs`
- `.github/scripts/check-all.test.mjs`
- `docs/tickets/T-0496-check-ticket-filter-chain.md` (build log only)

## Contract impact
None.

## Definition of done
AC-1..AC-6 hold and are recorded · `npx -y pnpm@10.28.2 -w test:repo-checks` green ·
`node .github/scripts/check-all.mjs` exits 0 · the `-w` gate once before handback
(`typecheck lint test --concurrency=1`, `format:check`) · no e2e · the scratch fault ticket is
deleted before commit · commits start `T-0496`.

## Notes
- The check reports, it never rewrites.
- When writing this ticket's log, describe matches in words or split them, or the check will
  flag its own ticket.

## Build / accept log
- New `.github/scripts/check-ticket-filter-chain.mjs`: `checkFilterChain(files)` over
  `{ path, content }`, `runCheck(root)` loading top-level `docs/tickets/*.md` only (a plain
  non-recursive `readdir`, so `log/` is never visited), T-0490's audit regex, the one-exempt-path
  constant for T-0490's own ticket file, and the line-join step for a command wrapped across one
  break. Node built-ins only.
- New `.github/scripts/check-ticket-filter-chain.test.mjs` (`node:test`), titles `T-0496 AC-n`.
- Wired into `check-all.mjs` (import + spread into `runAll`'s findings) and into
  `check-all.test.mjs`'s T-0320 AC-10 source test's `SUBCHECKS` list; that test's title changed
  from "six" to "eight" sub-checks — `check-vitest-tmp.mjs`/`runVitestTmp` was already wired into
  `runAll` but missing from that list before this ticket (a pre-existing gap, fixed here along
  with adding ours, since the title has to match the real count).
- AC map: AC-1 one-line chains (plain, npx prefix, `-F`, `--filter=`) → one test, 4 variants.
  AC-2 both wrap shapes (pkg-then-scripts, one-script-then-two) → one finding each at the `pnpm`
  line; a separate test confirms a one-line match is never also counted by the wrap branch.
  AC-3 allowed forms (three separate per-package commands, `pnpm -w …`, one script + `-- --run
  x`, T-0440's real wrap text, `_template.md`'s live note, and the workspace-root form with every
  script name) → all produce zero findings. AC-4 scope (top-level only, `log/` excluded,
  T-0490's file exempt) → `runCheck(tmpRoot)` on a temp tree. AC-5 wired/real-repo + planted
  fault → both as a `node:test` and manually. AC-6 fault proof for the wrap.
- Red run (pre-fix, by design): none needed — the new check didn't exist before this ticket, so
  there was no prior red/green state to show; AC-6 supplies the fault-removal proof instead.
- **AC-5 manual proof** (also automated, see below): clean run on the real repo → exit 0, no
  output. Created `docs/tickets/T-9998-fault.md` with the bad one-line form → `node
  .github/scripts/check-all.mjs` exits 1, printing
  `docs/tickets/T-9998-fault.md:1: ticket-filter-chain: …`. Deleted the scratch file → exit 0
  again, confirmed with `git status --short docs/tickets/` showing nothing.
- **AC-6**: on a backup copy (`cp`), replaced the line-join branch body with an early `return`
  (dropping the join step). Re-ran `check-ticket-filter-chain.test.mjs`: AC-2's wrap test went
  red (7 pass, 1 fail) while every other test stayed green. Restored the original file with `cp`
  from the backup; re-ran the same file: 8/8 green again.
- **Cross-file race found and fixed**: `node --test` runs sibling `*.test.mjs` files as separate
  processes. The new AC-5 test is the only one in the suite that mutates the real
  `docs/tickets/` (as the ticket's own scratch-fault proof asks for); running it alongside
  `check-all.test.mjs`'s two real-repo-reading tests in the same `node --test` invocation raced
  about 1 run in 5 (reproduced, then fixed). Added a tiny cross-process advisory lock
  (`mkdirSync`/`rmdirSync` on a repo-root `.t0496-real-repo.lock` dir, polled every 20 ms) around
  the mutating section in `check-ticket-filter-chain.test.mjs` and around both real-repo tests in
  `check-all.test.mjs`. Confirmed with 5 consecutive runs of
  `node --test check-ticket-filter-chain.test.mjs check-all.test.mjs`, all green, and the lock
  dir absent afterwards (no leftover).
- Gate (D-0178, ticket size small, infra/tooling script only): `node
  .github/scripts/check-ticket-filter-chain.test.mjs` and `check-all.test.mjs` directly green (8
  and 7 tests respectively) · `npx -y pnpm@10.28.2 -w test:repo-checks` → 167/167 pass (run
  several times, including 3 back-to-back, to rule out flake; all green) · `node
  .github/scripts/check-all.mjs` → exit 0 on the real repo · the `-w` gate once:
  `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` → 19/19 tasks successful, full
  turbo cache, 259 test files / 3600 tests passed in `@workoutlab/web` plus the rest cached ·
  `npx -y pnpm@10.28.2 -w format:check` → all files match Prettier · no e2e (infra/tooling
  change, no `apps/web/src` or `tests/e2e` touched, D-0178). `git status --short` clean apart
  from the four files this ticket lists.
