---
id: T-0336
title: "check-lane-paths: use the diff base nearest HEAD (a stale origin/main no longer flags squad files), and fail loudly in CI when no diff base resolves (folds in T-0337)"
lane: infra
screens: []
decisions: [D-0074, D-0167, D-0183]
deps: [T-0320]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main 003c20d (D-0183 §1). From the T-0320 review
(T-0336, T-0337). T-0337 is folded in: same function pair, same test seam, one small diff. Build
flow: wl-build-infra. About ⅓ day. -->

## Why
`.github/scripts/check-lane-paths.mjs` (T-0320, D-0074) diffs a ticket branch against a base, and
reads the ticket's grants from that base. `resolveChangedPaths` tries `origin/main`, then `main`,
and uses the **first** merge base that resolves.

Two problems:

1. **A stale `origin/main` wins over a newer local `main`.** Locally, the orchestrator commits on
   `main` and pushes later. A ticket branch cut from local `main` then has a merge base with
   `origin/main` that is older than its real fork point. Everything committed on `main` in between
   (board rows, ticket files) shows up as this branch's change. A UF-10-only branch reports
   `.squad/board.md: lane-path-not-owned`, and a ticket committed to local `main` but not yet
   pushed reports `ticket-not-on-base`. Loud, not silent, but wrong, and it costs a builder a
   detour. CI is unaffected: its checkout has no local `main`.
2. **No base in CI is a silent pass (T-0337).** When no merge base resolves, `runCheck` prints
   a note and returns no findings (T-0320 AC-8). That is right for an offline laptop. In CI it
   means the check did nothing on a PR. AC-9's `fetch-depth: 0` guard makes it unlikely, but a
   checkout change it does not recognise would bring the silent no-op back.

## Scope
- In (`.github/scripts/check-lane-paths.mjs` and its tests):
  - `resolveChangedPaths(git)` asks for both merge bases (`origin/main` and `main`, as today) and
    uses the one **nearest HEAD**:
    - only one resolves: use it (today's fallback);
    - both resolve to the same commit: use it, with no further git call;
    - they differ: run `git merge-base --is-ancestor <originBase> <mainBase>`. Exit 0 (no throw
      from the injected `git`) means `main`'s base is the descendant, so use it. Any throw means
      use `origin/main`'s base (today's choice, kept for diverged or odd histories).
  - The chosen base feeds both the diff and `readTicketAtBase`, as today.
  - The return shape of `resolveChangedPaths` is unchanged: `{ changed, note, base }` (existing
    `deepEqual` tests pin it).
  - `runCheck`: on a ticket branch, when `resolveChangedPaths` returns `changed: null` (no merge
    base, or `git diff` failed) **and** `env.CI` matches `/^(true|1)$/i`, return a finding instead
    of the note:
    `{ path: ".github/workflows/ci.yml", line: 1, rule: "no-diff-base-in-ci", message }`. The
    message includes the existing note text and says the checkout needs `fetch-depth: 0` or a
    `git fetch origin main`. The CI-wiring findings are still included alongside it.
  - Off CI (`CI` unset, empty, `false` or `0`), behaviour is unchanged: the note, no finding.
  - Off a ticket branch, behaviour is unchanged in CI too: no-op (limit 1 in the file header).
  - Update the file header: one line under limit 1 or AC-8's comment saying a missing base fails
    in CI (T-0337).
- Out:
  - Running `git fetch` (the check must stay offline, T-0320 AC-8).
  - Reading `.squad/ownership.yaml` from the base (that is T-0347).
  - Symlinks (T-0338), web-shell exemptions (T-0339), nested negative headings (T-0348).
  - `.github/workflows/ci.yml` itself.

### Edge cases that are in scope
- **Fresh worktree, origin/main up to date:** both bases equal; one diff, no extra git call (AC-3).
- **origin/main ahead of local main** (someone else pushed; local `main` not pulled): `origin/main`'s
  base is the descendant, so it is used (AC-2).
- **No `origin` remote at all** (a local-only clone): `main` alone, as today (existing AC-8 test).
- **CI with a shallow checkout:** a finding, exit 1 (AC-4).

## Acceptance criteria
Each test title starts with `T-0336 AC-n`. New tests go in
`.github/scripts/check-lane-paths.t0336.test.mjs` (the `t0466` file's pattern: injected `git`,
`env: {}` unless the AC says otherwise). Existing tests in `check-lane-paths.test.mjs` and
`check-lane-paths.qa.test.mjs` must pass **unmodified**.

- **AC-1 (nearer local main wins, red on main)**
  - **Given** an injected `git` where `merge-base origin/main HEAD` → `old1111`,
    `merge-base main HEAD` → `new2222`, `merge-base --is-ancestor old1111 new2222` → `""` (exit 0),
    `diff … old1111...HEAD` → `.squad/board.md\napps/web/src/features/UF-10/x.ts`, and
    `diff … new2222...HEAD` → `apps/web/src/features/UF-10/x.ts`.
  - **When** `resolveChangedPaths(git)` runs.
  - **Then** it returns `{ changed: ["apps/web/src/features/UF-10/x.ts"], note: null, base: "new2222" }`,
    and no git call starts with `fetch`.

  **Red:** on main it returns `base: "old1111"` and includes `.squad/board.md`.
- **AC-2 (origin/main ahead wins)** Same as AC-1, but `--is-ancestor old1111 new2222` throws
  (exit 1). **Then** `base` is `"old1111"` and the diff was taken against `old1111...HEAD`.
- **AC-3 (equal bases, no extra call)** Both merge bases → `abc1234`. **Then** `base` is
  `"abc1234"` and the recorded git calls contain no `--is-ancestor`.
- **AC-4 (through `runCheck`, real git)** In a temp repo built like
  `check-lane-paths.qa.test.mjs`'s `gitRepo` helper:
  - `main` has commit A, then commit B that adds the UF-10 ticket file and edits
    `.squad/board.md`; `refs/remotes/origin/main` points at A (`git update-ref`);
  - branch `t/T-0307a-x` from B edits only `apps/web/src/features/UF-10/x.ts`.

  **Then** `runCheck(root, { branch: "t/T-0307a-x", env: {} })` returns no lane finding (no
  `lane-path-not-owned`, no `ticket-not-on-base`). **Red:** on main it reports at least one of
  them.
- **AC-5 (T-0337: CI fails loudly)** With an injected `git` that throws on every call, branch
  `t/T-0307a-x` and the qa file's `makeRoot` fixture:
  - `env: { CI: "true" }` → the result contains exactly one `no-diff-base-in-ci` finding, at
    `.github/workflows/ci.yml:1`, whose message matches `/no diff base/i` and `/fetch-depth: 0/`;
  - `env: { CI: "1" }` → the same;
  - `env: {}`, `env: { CI: "false" }` and `env: { CI: "0" }` → no `no-diff-base-in-ci` finding,
    and the note is printed (today's behaviour);
  - `env: { CI: "true" }` with `branch: "main"` → no `no-diff-base-in-ci` finding.
- **AC-6 (T-0337: a failed diff counts too)** `merge-base` resolves, `diff` throws,
  `env: { CI: "true" }` → one `no-diff-base-in-ci` finding.

**Red proof.** Run AC-1, AC-4 and AC-5's first bullet on main: all three must fail. Then plant
one fault on a backup copy: make the differing-bases branch always pick `origin/main`'s base.
AC-1 and AC-4 must fail, AC-2 must pass. Restore with `cp`. Record every run.

## Paths you may change
- `.github/scripts/check-lane-paths.mjs`
- `.github/scripts/check-lane-paths.t0336.test.mjs` (new)
- **Listed extras:**
  - `docs/tickets/T-0336-check-lane-paths-nearest-base.md`, for the build and accept logs.

## Contract impact
None.

## Definition of done
- Tests for every AC pass, with the red runs and the planted fault recorded.
- `node --test .github/scripts/check-lane-paths*.test.mjs` is green (the scoped run while you
  work).
- `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` are green. Nothing under `apps/` or `packages/` changes,
  so the `-w typecheck lint test` gate and e2e are not needed (D-0178); say so in the log.
- Contracts are unchanged.
- Commits start `T-0336`.

## Notes
- **Parallel:** the only `check-lane-paths` ticket in flight. T-0338, T-0339, T-0347 and T-0348
  change the same file, so they wait for this one (D-0183 §1). Runs alongside T-0322 and T-0330:
  neither touches `.github/**`.
- T-0337 is closed as folded into this ticket.
- Grants are still read from the base, so a branch can't grant itself (D-0074 §5). Picking local
  `main` only matters on a laptop; CI's checkout has no local `main`.

## Build / accept log
Archived in `docs/tickets/log/T-0336.md` (D-0157).
