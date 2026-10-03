---
id: T-0466
title: "check-lane-paths: a ticket branch may always edit its own docs/tickets/<id>-*.md, with no Listed-extras line (D-0167 §1)"
lane: infra
screens: []
decisions: [D-0167, D-0074, D-0071, D-0157]
deps: []
status: ready
---
<!-- Groomed 2026-10-03 by product-owner. Build flow: wl-build-infra. About ¼ day. It changes .github/scripts, so it needs a draft PR (orchestrator). -->

## Why
D-0074 makes a ticket file load-bearing for CI. A build that appends to its own log without a
self-grant line fails `check-lane-paths` with `lane-path-not-owned` (T-0356, T-0307b and T-0308a
all tripped on 2026-10-03). Each fix is an orchestrator commit on `main` and a lost tick. A
ticket's own file is always its own (D-0167 §1).

## Scope
- In:
  - `.github/scripts/check-lane-paths.mjs`: in `checkLanePaths`, a changed path that is the
    ticket's own file is allowed before the shared rules and lane patterns are checked. Own file
    means a direct child of `docs/tickets/` whose basename starts with `${ticketId}-` and ends
    `.md`. Share the predicate with `readTicketAtBase`, so the two can't drift.
  - The header comment and the `listedPathsFromTicket`/`checkLanePaths` docs say so in one line.
    D-0074's four limits stay verbatim (T-0320 AC-11).
  - Tests in `.github/scripts/` (extend `check-lane-paths.test.mjs`, or a new
    `check-lane-paths.t0466.test.mjs`, picked up by the `test:repo-checks` glob).
- Out:
  - Any change to how grants are read (still from the base, D-0074 §5) or to the grant parser.
  - `docs/tickets/log/**`, the board, other tickets' files.
  - Editing `.squad/README.md` or agent roles (groomers may keep listing the self-grant).

### Edge cases that are in scope
- **Suffixed ids:** `T-0307b` owns `T-0307b-*.md`. `T-0307` doesn't own `T-0307b-*.md`.
  `T-0466` doesn't own `T-0466a-*.md`.
- **Unknown lane:** the own file is still allowed. The `lane-unknown` finding still fires.
- **Off a ticket branch:** still a no-op (limit 1).

## Acceptance criteria
**Test setup.** The pure `checkLanePaths({ticketId, ticketText, ownershipText, changed})` with the
real `.squad/ownership.yaml` text (or the existing test fixture). The ticket text has `lane: infra`
and a `## Paths you may change` section that does **not** mention `docs/tickets/`. For AC-4,
`runCheck` with a stubbed `git` (as the existing tests stub it).

**Test rules.** Both values of every binary condition get a test. **AC-1, AC-3 and AC-4 must fail
on `main`**: the build log records each red run (a `lane-path-not-owned` finding on the ticket
file). It also records one planted fault turning AC-2 red: the predicate as
`basename.startsWith(ticketId)` (no `-`).

- **AC-1 (own file allowed)** Given ticket `T-0466` (lane `infra`, no self-grant line), When
  `changed` is `["docs/tickets/T-0466-check-lane-paths-self-grant.md"]`, Then findings are `[]`.
  Also `ticketId: "T-0307b"` with `docs/tickets/T-0307b-progress.md` gives `[]`.
- **AC-2 (nothing else allowed)** With the same ticket text, each of these is exactly one
  `lane-path-not-owned` finding:
  - `docs/tickets/T-0465-route-boundary-focus-and-reset.md` (another ticket);
  - `docs/tickets/T-0466a-split.md` for `T-0466`;
  - `docs/tickets/T-0307b-progress.md` for `T-0307`;
  - `docs/tickets/log/T-0466.md`;
  - `docs/tickets/T-0466-notes.txt`;
  - `docs/tickets/_template.md`.
- **AC-3 (unknown lane)** Given `lane: web-featur:UF-10` and `changed` = the own file only, Then
  findings are exactly one `lane-unknown` (on the ticket path) and no `lane-path-not-owned`.
- **AC-4 (wired through runCheck)** Given branch `t/T-0466-check-lane-paths-self-grant`, a stub
  `git` whose diff lists only `docs/tickets/T-0466-check-lane-paths-self-grant.md`, and the base
  copy of that ticket without a self-grant, When `runCheck` runs, Then it returns no
  lane finding. **The pair:** the same diff plus `apps/web/src/lib/i18n/en.ts` returns exactly one
  `shared-i18n-en-edited`. Editing your own ticket doesn't widen your grants.
- **AC-5 (unchanged surface)** Every existing `check-lane-paths*.test.mjs` test passes unedited,
  the four-limits test (T-0320 AC-11) included. `node .github/scripts/check-all.mjs` is green on
  `main` and on this branch.

## Paths you may change
- `.github/**` (the lane: `infra`). In practice `.github/scripts/check-lane-paths.mjs` and its
  tests.
- **Listed extras:**
  - `docs/tickets/T-0466-check-lane-paths-self-grant.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded · the cached gate
(D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`
and `check-all` green · contracts unchanged · commits start `T-0466`.

## Notes
- **Flow:** `wl-build-infra`. **Draft PR:** it changes `.github/scripts/`, so the orchestrator
  opens it as a draft PR for CI before merge.
- **Parallel:** no shared file with T-0446, T-0417, T-0461, T-0459, T-0463 or T-0465 (all under
  `apps/web/**`). Its tests are `node --test` repo checks, so it needs no e2e run.

## Build / accept log
- 2026-10-03 devops: added `isOwnTicketFile` (shared with `readTicketAtBase`), allowed before shared rules; tests in `check-lane-paths.t0466.test.mjs`. AC-1..4 -> the four `T-0466 AC-n` tests; AC-5 -> existing 159 repo-check tests pass unedited.
- Red on unfixed code: AC-1, AC-3, AC-4 fail (`lane-path-not-owned` on the ticket file). Planted fault (`startsWith(ticketId)`, no `-`) turned AC-2 red; restored from backup copy.
- 2026-10-03 QA: HEAD a33ef62, clean. Repro: main's script -> AC-1/3/4 red (1 pass, 3 fail); no-dash predicate -> AC-2 red; own fault (any docs/tickets/ file allowed) -> AC-2 red; all restored from backup. `-w test:repo-checks` 159/159, check-all exit 0. Real-branch scratch commit (own file + T-0465 file): check-all flagged only T-0465 `lane-path-not-owned`; scratch reset. Verdict: done, AC-1..5 proven.
