---
id: T-0467
title: "check-lane-paths: the D-0167 §1 own-ticket-file note in the header and the listedPathsFromTicket doc; T-0466 AC-3 asserts the finding's path"
lane: infra
screens: []
decisions: [D-0167, D-0074, D-0157, D-0158]
deps: [T-0466]
status: done
---
<!-- Groomed 2026-10-04 by product-owner. Build flow: wl-build-infra. About ⅛ day. It changes .github/scripts, so it needs a draft PR (orchestrator). -->

## Why
T-0466 taught `check-lane-paths` that a ticket always owns its own `docs/tickets/<id>-*.md`
(D-0167 §1). Its review and accept (`docs/tickets/log/T-0466.md`) found two gaps:
- The file header and the `listedPathsFromTicket` doc comment don't say so. A reader of the
  header, or of the grant parser, still thinks a ticket must list its own file.
- The T-0466 AC-3 test checks for one `lane-unknown` finding but not where it points. Today the
  test passes no `ticketPath`, so the finding lands on the fallback `docs/tickets/T-0466.md`, and
  a regression that hangs it on the wrong path would pass.

## Scope
- In:
  - `.github/scripts/check-lane-paths.mjs`, comments only:
    - the leading `//` header gets one line (or one wrapped sentence) saying a ticket's own
      `docs/tickets/<id>-*.md` is always allowed with no Listed-extras line (D-0167 §1). Put it
      **before** the "WHAT THIS DOES NOT COVER" block. Keep the block's four limits verbatim, and
      keep the header pure `//` lines with no hedge word (T-0320 AC-11).
    - the `listedPathsFromTicket` JSDoc gets one line: the ticket's own file need not be listed;
      `checkLanePaths` allows it before this list is consulted (D-0167 §1, `isOwnTicketFile`).
    - Optional: rewrap the `checkLanePaths` JSDoc's first line (line ~294, over 100 columns) to
      the file's width. No wording change.
  - `.github/scripts/check-lane-paths.t0466.test.mjs`: the `T-0466 AC-3` test passes
    `ticketPath` (the own file path) and asserts the `lane-unknown` finding's `path`.
- Out:
  - Any code change to `check-lane-paths.mjs` (no logic, no exports, no messages).
  - Other tests, `docs/tickets/log/**`, the board, D-0074 or D-0167.
  - A test that pins the new prose. The repo pins only D-0074's four limits (T-0320 AC-11); this
    ticket doesn't add a prose pin.

## Acceptance criteria
**Test rules.** The AC-2 assertion must be shown red by a planted fault, made on a backup copy of
`check-lane-paths.mjs` and restored from that copy with `cp` (never `git checkout`). The build log
records the red run in one line.

- **AC-1 (header note)** Given `.github/scripts/check-lane-paths.mjs` on this branch, When the
  build log runs `grep -n "D-0167" .github/scripts/check-lane-paths.mjs`, Then one hit is in the
  leading `//` header (above the first `import`) and its line (or wrapped sentence) says a
  ticket's own `docs/tickets/<id>-*.md` is always allowed without a Listed-extras line. The
  header's four limits are unchanged: `git diff main -- .github/scripts/check-lane-paths.mjs`
  shows no `-` line inside the "WHAT THIS DOES NOT COVER" block. Checked by reading the diff;
  the T-0320 AC-11 tests in `check-lane-paths.test.mjs` (four limits verbatim, no hedge word,
  `headerOf()` only `//` lines) pass unedited.
- **AC-2 (AC-3 asserts the path)** Given ticket `T-0466` with `lane: web-featur:UF-10`,
  `changed` = `["docs/tickets/T-0466-check-lane-paths-self-grant.md"]` and
  `ticketPath` = that same path, When `checkLanePaths` runs, Then findings are exactly one, its
  `rule` is `lane-unknown` and its `path` is
  `docs/tickets/T-0466-check-lane-paths-self-grant.md`. **Red proof:** on a backup copy, change
  the `lane-unknown` finding's `path: resolvedTicketPath` to `path: \`docs/tickets/${ticketId}.md\``
  (ignore `ticketPath`); the AC-3 test fails on the path assertion only. Restore with `cp`; it
  passes.
- **AC-3 (listedPathsFromTicket doc)** Given the JSDoc directly above
  `export function listedPathsFromTicket`, Then it contains one line citing D-0167 §1 that says
  the ticket's own file need not be listed (it is allowed by `isOwnTicketFile` in
  `checkLanePaths`). Checked by reading the diff; `grep -n "D-0167"` shows the hit between the
  JSDoc's `/**` and the `export function listedPathsFromTicket` line.
- **AC-4 (nothing else moves)** `git diff main --stat` lists only
  `.github/scripts/check-lane-paths.mjs`, `.github/scripts/check-lane-paths.t0466.test.mjs` and
  this ticket file. In `check-lane-paths.mjs` every changed line is a comment line. Every other
  `check-lane-paths*.test.mjs` test passes unedited; `-w test:repo-checks` is green with the same
  test count as `main`; `node .github/scripts/check-all.mjs` exits 0 on this branch.

## Paths you may change
- `.github/**` (the lane: `infra`). In practice `.github/scripts/check-lane-paths.mjs` (comments)
  and `.github/scripts/check-lane-paths.t0466.test.mjs`.
- **Listed extras:**
  - `docs/tickets/T-0467-check-lane-paths-own-file-docs.md`: this file, for the logs (allowed
    anyway by D-0167 §1).

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the AC-2 planted fault's red run recorded · the cached gate
(D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`
and `check-all` green · contracts unchanged · commits start `T-0467`.

## Notes
- **Flow:** `wl-build-infra`. **Draft PR:** it changes `.github/scripts/`, so the orchestrator
  opens it as a draft PR for CI before merge.
- **Parallel:** no shared file with in-flight T-0478 (UF-03) or T-0471 (UF-11), both under
  `apps/web/**`, or with T-0442 (`apps/landing/**`). Its tests are `node --test` repo checks, so
  it needs no e2e run.
- **Why the fault:** the AC-3 test calls `checkLanePaths` without `ticketPath` today, so
  `resolvedTicketPath` falls back to `docs/tickets/T-0466.md`. Passing the real path is what
  makes the new assertion catch a regression that ignores `ticketPath` (`runCheck` passes
  `ticketAtBase.relPath`).
- No new decision: this is doc and test hygiene under D-0167 §1.

## Build / accept log
Archived in `docs/tickets/log/T-0467.md` (D-0157).
