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
Archived in `docs/tickets/log/T-0496.md` (D-0157).
