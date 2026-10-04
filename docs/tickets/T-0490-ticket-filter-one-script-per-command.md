---
id: T-0490
title: "Ticket hygiene: replace `pnpm --filter <pkg> typecheck lint test` (runs only typecheck) with one command per script in every ticket file"
lane: product
screens: []
decisions: []
deps: []
status: ready
groomed: 2026-10-04
---
<!-- Written by product-owner 2026-10-04 (groom mode). Build flow: product-owner (docs only). About 20-30 minutes. No code, no tests to run beyond check-all. -->

## Why
T-0442's QA and accept (log: `docs/tickets/log/T-0442.md`) found that the idiom
`pnpm --filter <pkg> typecheck lint test`, used in many tickets' AC and DoD lines, does not do what
it says. With `--filter`, pnpm runs **one** script, the first name (`typecheck`), and passes
`lint test` to it as extra CLI arguments. `lint` and `test` never run, so a builder who follows the
ticket literally can report "green" without having run either. T-0442's QA ran each script
separately to get a real answer. Tickets get copied as templates for new tickets, so the wrong
idiom keeps spreading until the existing text is fixed.

The workspace-root form `pnpm -w typecheck lint test` is a different case (the root `typecheck`
script is `turbo run typecheck`, which does take further task names); its own gap is T-0444
(infra). Leave it alone here.

## Scope
- In:
  - Every line in `docs/tickets/*.md` (top level only) that matches the anti-pattern. Audit regex
    (ERE): `pnpm(@[0-9.]+)? +(--filter|-F)[ =]+[^ ]+ +(typecheck|lint|test|build)( +(typecheck|lint|test|build))+`.
    Also check for the same command wrapped across a line break (a line ending in
    `--filter <pkg>` followed by a line starting with two or more script names).
  - The audit on `main` at `a191d11` found 14 lines, one per file:
    T-0211 (AC4), T-0212 (AC6), T-0221 (AC8), T-0228 (AC4), T-0230 (AC4), T-0231 (AC3),
    T-0232 (AC9), T-0234 (AC4, `@workoutlab/exercises`), T-0236 (AC5), T-0237 (AC5),
    T-0240 (AC8) (all `@workoutlab/engine` unless noted), T-0413 (AC7, `@workoutlab/web`),
    T-0426 (AC4, `@workoutlab/web`, wrapped onto two lines), T-0442 (AC-4,
    `@workoutlab/landing`). Re-run the regex first; fix whatever it finds on the current `main`,
    not only this list.
  - Rewrite each as one command per script, keeping that line's own prefix (`pnpm` or
    `npx -y pnpm@10.28.2`) and package, e.g.
    `` `npx -y pnpm@10.28.2 --filter @workoutlab/engine typecheck`, `npx -y pnpm@10.28.2 --filter @workoutlab/engine lint` and `npx -y pnpm@10.28.2 --filter @workoutlab/engine test` are green. ``
    Keep the rest of the sentence (AC number, "is green", any following clauses) as it was.
  - `docs/tickets/_template.md`: one authoring note under `## Definition of done`, e.g.
    "Per-package commands: write one command per script (`pnpm --filter <pkg> typecheck`, then
    `… lint`, then `… test`). Listing several script names after one `--filter` runs only the
    first; pnpm passes the rest to it as arguments."
- Out:
  - `docs/tickets/log/**`: build and QA logs record what was actually run; do not rewrite history.
  - Any `pnpm -w typecheck lint test` line (T-0444's scope).
  - `agents/roles/**`, `.claude/**`, `.squad/**`, `CLAUDE.md`: not product lane. The audit found
    no per-package occurrence there; if the builder finds one, list it as a follow-up.
  - Ticket `status:` fields and any other wording in the touched files.

## Acceptance criteria
- **AC1 (no anti-pattern left)** Given the fixed tree, When
  `grep -nE "pnpm(@[0-9.]+)? +(--filter|-F)[ =]+[^ ]+ +(typecheck|lint|test|build)( +(typecheck|lint|test|build))+" docs/tickets/*.md`
  runs from the repo root and its output is piped through
  `grep -v '^docs/tickets/T-0490-'` (this ticket quotes the bad form on purpose), Then it prints
  nothing. Record the before count (14 at `a191d11`, or the current count) and the after count
  (0) in the accept log.
- **AC2 (each script still named for the same package)** Given each fixed line, Then it names
  `typecheck`, `lint` and `test` as three separate backticked commands for the same package and
  with the same prefix as before. Check: `git diff -U0 -- docs/tickets/` shows, for each file,
  exactly the one AC/DoD line (two for T-0426) removed and its rewritten form added.
- **AC3 (nothing else moved)** Given `git diff --stat`, Then only the files the audit found plus
  `docs/tickets/_template.md` and this ticket file change, and no file under `docs/tickets/log/`
  changes.
- **AC4 (template note)** Given `docs/tickets/_template.md`, Then its `## Definition of done`
  section carries the one-command-per-script note, and the audit regex in AC1 does not match the
  template (write the bad form as a description, or split it so the regex cannot match, e.g.
  name the scripts in a list rather than as one command).
- **AC5 (checks)** `node .github/scripts/check-all.mjs` exits 0.

## Paths you may change
- `docs/tickets/*.md` (top level; lane `product`), only the lines the audit finds.
- `docs/tickets/_template.md`
- `docs/tickets/T-0490-ticket-filter-one-script-per-command.md` (accept log only)

No overlap with T-0491 (UF-06 test) or T-0493 (D-0084). T-0374 edits
`docs/tickets/T-0219-…md`, which this audit does not touch; if both are built at once, they do
not conflict.

## Contract impact
none

## Follow-ups (for the orchestrator to file, optional)
- infra: a `check-all` rule that fails on the AC1 regex in `docs/tickets/*.md`, so the idiom
  cannot come back.
- orchestrator: if `agents/roles/product-owner.md` ever gains per-package gate text, apply the same
  one-command-per-script wording there.

## Definition of done
AC1-AC5 hold and are recorded in the log · `node .github/scripts/check-all.mjs` green ·
contracts unchanged · commit message starts `T-0490` (no screen IDs; docs only).

## Build / accept log
- Audit regex re-run on `main` before any edit: 14 matches (one per file), matching the ticket's
  list exactly: T-0211 (AC4), T-0212 (AC6), T-0221 (AC8), T-0228 (AC4), T-0230 (AC4), T-0231 (AC3),
  T-0232 (AC9), T-0234 (AC4), T-0236 (AC5), T-0237 (AC5), T-0240 (AC8), T-0413 (AC7), T-0426 (AC4,
  the two-line wrapped case), T-0442 (AC-4). Before count: 14.
- Mid-build: a dispatch mistake put this build and T-0493's build in the same shared working
  directory at once; T-0493's agent checked out its own branch over mine mid-edit. Paused on
  instruction, reported state, and the orchestrator recovered the first 8 edits as commit
  `1c84306` on `t/T-0490-ticket-script-hygiene` and handed back an isolated worktree
  (`workoutLab-worktrees/T-0490`). Verified `git show --stat 1c84306` matched the 8
  files/8 lines before resuming; no edits were lost or mixed with T-0493's.
- Fixed the remaining 6 files (T-0236, T-0237, T-0240, T-0413, T-0426, T-0442) the same way: each
  `pnpm(@ver)? --filter <pkg> typecheck lint test` (or the T-0426 two-line wrap) rewritten as one
  backticked command per script (`… typecheck`, `… lint`, `… test`), same prefix and package,
  rest of the sentence unchanged.
- Added the one-command-per-script authoring note to `docs/tickets/_template.md` under
  `## Definition of done`, written as a list (not a chained command) so it does not match the AC1
  regex — confirmed with the regex run below.
- **AC1**: `grep -nE "pnpm(@[0-9.]+)? +(--filter|-F)[ =]+[^ ]+ +(typecheck|lint|test|build)( +(typecheck|lint|test|build))+" docs/tickets/*.md | grep -v '^docs/tickets/T-0490-'`
  → before: 14 lines. After (this build): 0 lines (grep exit 1, no match). Also confirmed
  `docs/tickets/_template.md` alone does not match the regex (exit 1).
- **AC2**: each rewritten line keeps the same prefix (`pnpm` or `npx -y pnpm@10.28.2`) and the
  same package for all three commands; `git diff` per file shows exactly the one AC/DoD line
  replaced (two lines for T-0426's wrapped form, one extra line for T-0442's wrapped rewrite).
- **AC3**: `git diff --stat` (combined with commit `1c84306`) touches exactly: T-0211, T-0212,
  T-0221, T-0228, T-0230, T-0231, T-0232, T-0234, T-0236, T-0237, T-0240, T-0413, T-0426, T-0442
  (the 14 audited files), plus `docs/tickets/_template.md` and this ticket file (log only). No
  file under `docs/tickets/log/` changed.
- **AC4**: `docs/tickets/_template.md` `## Definition of done` section carries the
  one-command-per-script note; regex confirmed non-matching (see AC1 note above).
- **AC5**: `node .github/scripts/check-all.mjs` → exit 0.
- Gate note (D-0178, ticket size small, docs-only, no contract/decision change): no code changed,
  so no `-w typecheck lint test` or e2e run was needed beyond `check-all.mjs` per the task's own
  instruction.
