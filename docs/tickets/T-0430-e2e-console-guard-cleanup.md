---
id: T-0430
title: "e2e: drop uf-08-setup's own consoleErrors helper (the console guard covers it), forbid in-spec console listeners in guarded specs, require the T-NNNN in the comment block above an allow, and reject /g and /y allow patterns"
lane: qa
screens: []
decisions: [D-0086, D-0091]
deps: [T-0425]
status: done
---
<!-- Groomed 2026-10-02 by product-owner. From the T-0425 review and accept log. Build flow: wl-build-qa. About ⅓ day. No app code changes. T-0425 is done, so this is ready now. Order in tests/e2e/**: T-0430 first, then T-0427 (qa) and T-0429 (web-shell). Both depend on this ticket, and they can run in parallel with each other because they touch different spec files. -->

## Why
- **T-0425 Scope/Out:** `uf-08-setup.spec.ts` still carries its own `consoleErrors(page)` helper
  (4 tests). The `consoleGuard` auto fixture now checks the same thing on every guarded test, so
  the helper duplicates it. A copy like this drifts: it reports `Failed to load resource:` lines
  that the guard deliberately exempts.
- **T-0425 review, AC5:** the rule "a `T-NNNN` on the line above each `consoleGuard.allow(`" is
  met by any code line that holds the text `T-0001`, a string literal for example. A 4-line
  comment block with the ticket on its first line fails the rule, although it is the better
  comment.
- **T-0425 review, flags:** `allow` keeps a `RegExp` and calls `pattern.test(line)` on every
  line. With `/g` or `/y`, `test` advances `lastIndex`, so the same pattern matches one line and
  misses the next identical one. The allow then fails at random.

## Scope
- In:
  - `tests/e2e/uf-08-setup.spec.ts`: delete `consoleErrors` and its 4 uses (T-0393 AC2, T-0393
    AC3, T-0412 AC2, T-0412 AC3). Every other assertion in those tests stays as it is.
  - `tests/e2e/fixtures/source-rules.ts` (new), with two pure functions, `allowCommentViolations`
    and `ownConsoleListeners`. Each takes `(file, source)` and returns `string[]` of
    `file:line`.
  - `tests/e2e/fixtures/guarded-test.ts`: `allow` throws on a global or sticky pattern.
  - `tests/e2e/fixture-guard.spec.ts`:
    - the T-0425 AC5 allow test switches to `allowCommentViolations`;
    - a new test runs `ownConsoleListeners` over every guarded spec except this one;
    - unit tests for both functions and for the flag check;
    - the comment above the allow in "setOffline does not suspend interception" names T-0429.
- Out:
  - App code. Removing the SW allow itself is T-0429.
  - Moving `uf-10-balance.spec.ts` onto the fixture: T-0427. Its own listeners are T-0427's to
    remove, and the AC1 rule here reaches it once it is guarded.
  - `tests/e2e/uf-03-list-summary.spec.ts` while T-0420 is open (see Coordination).

## Acceptance criteria
Test titles start with `T-0430 ACn`.
- **AC1 (no own console listener in a guarded spec; red on main)** `ownConsoleListeners(file,
  source)` reports each line, outside `//` and `/* */` comments, that matches
  `\.on\(\s*["'](console|pageerror)["']`. A test in `fixture-guard.spec.ts` runs it over every
  guarded spec except `fixture-guard.spec.ts` and expects `[]`. On main it reports
  `uf-08-setup.spec.ts:684` and `:687`. Record that red run in the build log.
  - **Unit cases.** `page.on("console", f)` is reported. `page.on('pageerror', f)` is reported.
    `// page.on("console")` is not. `page.on("request", f)` is not.
- **AC2 (the helper is gone, and the guard still covers those tests)**
  - `uf-08-setup.spec.ts` contains no `consoleErrors`, and the four tests keep every other
    assertion.
  - **Planted fault.** Temporarily add `await page.evaluate(() => console.error("t0430-planted"))`
    to T-0393 AC2. It fails at teardown with `console error in e2e` and `t0430-planted`. Record
    the run, then revert.
- **AC3 (the T-NNNN sits in the comment block above an allow)** `allowCommentViolations(file,
  source)` reports each line containing `consoleGuard.allow(` unless one line of the contiguous
  block of `//` lines directly above it matches `T-\d{4}`. A blank line or a code line ends the
  block. The T-0425 AC5 test uses it for every spec except `fixture-guard.spec.ts` and expects
  `[]`. Unit cases:
  - `// T-0429 SW registration` above: passes.
  - `// T-0429 follow-up` then `// more text` above: passes.
  - `const ticket = "T-0429";` above: reported (the T-0425 inline check accepts this; the build
    log shows it).
  - `// T-0429`, a blank line, then the call: reported.
  - `// see the ticket` above: reported.
  - The call on line 1: reported.
  - A call spread over two lines (`consoleGuard.allow(` then the pattern) with `// T-0429` above:
    passes.
- **AC4 (`/g` and `/y` are rejected; red on main)** `installConsoleGuard(context).allow(/x/g)`
  throws an `Error` whose message contains `consoleGuard.allow` and `global or sticky`. So do
  `/x/y` and `/x/gi`. `/x/`, `/x/i`, `/x/m`, `/x/s` and `/x/u` are accepted, and an allowed
  `/t0430-flag/i` exempts two identical `console.error("t0430-flag")` lines (`assertClean()`
  doesn't throw). On main `allow(/x/g)` doesn't throw.
- **AC5 (the SW allow names its ticket)** In "setOffline does not suspend interception", the
  comment block directly above `consoleGuard.allow(` contains `T-0429`.
- **AC6 (the suite is green)** `pnpm --filter @workoutlab/web test:e2e` passes in full. No
  `consoleGuard.allow` was added outside `fixture-guard.spec.ts`, or the build log lists each one
  with its follow-up ticket.

## Paths you may change
- `tests/e2e/**` (the lane: `qa`).
- **Listed extras:**
  - `docs/tickets/T-0430-e2e-console-guard-cleanup.md`: this file, for the build and accept logs.

## Contract impact
None.

## Coordination
- **Order in `tests/e2e/**`:** T-0430, then T-0427 and T-0429. T-0429 edits the same
  `fixture-guard.spec.ts` test (it removes the allow that AC5 relabels). T-0427 brings
  `uf-10-balance.spec.ts` under the AC1 and AC3 rules. Don't run either one in the same window as
  this ticket.
- **T-0420 (UF-03, being built) creates `tests/e2e/uf-03-list-summary.spec.ts`.**
  - If T-0420 merges first, the AC1 and AC3 checks cover that file too. This ticket may bring its
    listener or allow comments in line (`tests/e2e/**` is this lane) and records it in the build
    log.
  - If T-0420 is still open when this merges, leave its file alone. The orchestrator tells
    T-0420's builder that the spec must pass the AC1 and AC3 rules on rebase.

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded · `pnpm -w typecheck
lint test --force --concurrency=1` green · `pnpm --filter @workoutlab/web test:e2e` green (the
whole suite) · `format:check` and `check:repo` green · contracts unchanged · commits start
`T-0430` (for example `T-0430: drop uf-08's own console check; harden the allow rules`).

## Build / accept log
Archived in `docs/tickets/log/T-0430.md` (D-0157).
