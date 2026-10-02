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

### Build (qa, 2026-10-02)
- `tests/e2e/fixtures/source-rules.ts` (new): `ownConsoleListeners(file, source)` and
  `allowCommentViolations(file, source)`, both returning `file:line`, plus the two helpers they
  use, `stripComments` (blanks `//` and `/* */` comments, keeps newlines; skips string, template
  and regex literals so a `//` in `"http://…"` is not a comment) and `commentBlockAbove(lines, i)`
  (the contiguous `//` lines directly above; a blank or code line ends it).
- `tests/e2e/fixtures/guarded-test.ts`: `allow` throws `consoleGuard.allow: <pattern> is a global
  or sticky pattern; …` when `pattern.global || pattern.sticky`. The doc comment and the
  `assertClean` message now say "in the comment block above".
- `tests/e2e/uf-08-setup.spec.ts`: `consoleErrors` and its 4 uses (T-0393 AC2, T-0393 AC3,
  T-0412 AC2, T-0412 AC3) deleted: the helper, the `const errors = …` lines and the
  `expect(errors).toEqual([])` lines. Nothing else in those tests changed.
- `tests/e2e/fixture-guard.spec.ts`: a new `T-0430 source rules and allow flags` block (AC1 and
  AC3 unit cases, AC4 flag tests). In `source assertions`, the T-0425 AC5 allow test now uses
  `allowCommentViolations`, and there are new tests for T-0430 AC1 (every guarded spec except
  this one, expects `[]`), AC2 (no `consoleErrors` in uf-08) and AC5. The comment above the SW
  allow in "setOffline does not suspend interception" now starts `// T-0429 (web-shell) removes
  this allow.`
- **Red on the unfixed code** (new tests in place, `guarded-test.ts` and `uf-08-setup.spec.ts`
  as on main): `playwright test fixture-guard.spec.ts -g T-0430` gave 3 failed, 7 passed.
  - AC1: `Expected []`, received `["uf-08-setup.spec.ts:684", "uf-08-setup.spec.ts:687"]`.
  - AC4: `/x/g`: "Received function did not throw".
  - AC2 source check: `consoleErrors` found in uf-08-setup.spec.ts.
  - The AC3 case `const ticket = "T-0429";` above the call is reported by
    `allowCommentViolations`. The same test shows that the T-0425 inline check (`/T-\d{4}/` on
    the line above) accepts that line.
- **AC2 planted fault:** `await page.evaluate(() => console.error("t0430-planted"))` added to
  T-0393 AC2 after the helper was gone. That run gave 1 failed at teardown
  (`fixtures/guarded-test.ts:226`, `assertClean`) with `console error in e2e: 1 line(s) were
  logged as errors … - console.error: t0430-planted (:0)`. Then reverted, and the file was
  checked as matching the post-change version.
- **Allows added outside `fixture-guard.spec.ts`: none.** `uf-03-list-summary.spec.ts` (T-0420)
  does not exist on this branch and was not touched. `uf-10-balance.spec.ts` still has its own
  listeners (lines 206–207). It is not guarded, so the AC1 run skips it (T-0427).
- Results: `flock … pnpm --filter @workoutlab/web test:e2e` gave 133 passed (whole suite).
  `flock … pnpm -w typecheck lint test --force --concurrency=1` gave 19/19 tasks.
  `test:repo-checks` gave 146 pass. `format:check` and `check:repo` were green.
- Seen, not changed (outside the scope): `npx eslint tests/e2e` reports
  `no-irregular-whitespace` at `uf-08-setup.spec.ts:837` (`MAIN_DETAIL`, line 851 on main). It is
  on main already: the U+00A0 is deliberate (T-0391 AC6), and `tests/e2e` is not in the turbo
  lint scope.

### Accept (product-owner, 2026-10-02): done
- **AC1:** `ownConsoleListeners` in `fixtures/source-rules.ts` checks code only, after
  `stripComments`. All four unit cases are present, plus extra cases: block comments, a `//`
  inside a URL, and line numbers that survive a multi-line comment. The guarded-spec run
  excludes `fixture-guard.spec.ts` and expects `[]`. It was red on the unfixed code at
  `uf-08-setup.spec.ts:684/:687`. `uf-10-balance.spec.ts:206–207` is not guarded yet, so
  T-0427 covers it.
- **AC2:** grep finds no `consoleErrors` anywhere in `tests/e2e`, and a source test locks that
  in. The planted fault is recorded: it failed at the `assertClean` teardown with
  `t0430-planted`, then was reverted. "Every other assertion kept" rests on the build log and
  the orchestrator's review.
- **AC3:** `allowCommentViolations` and `commentBlockAbove` match the rule: contiguous `//`
  lines, and a blank or code line ends the block. All seven unit cases are present. The T-0425
  AC5 test uses the new rule for every spec except this file.
- **AC4:** `allow` throws on `pattern.global || pattern.sticky` with a message containing
  `consoleGuard.allow` and `global or sticky`. The tests cover `/g`, `/y` and `/gi` (rejected),
  `/`, `/i`, `/m`, `/s` and `/u` (accepted), and the two identical `/t0430-flag/i` lines. It was
  red on the unfixed code (`/x/g` did not throw).
- **AC5:** the comment above the SW allow starts with `// T-0429 (web-shell) removes this
  allow.` A test finds that block through `commentBlockAbove`.
- **AC6:** whole e2e suite 133/133. The `-w` gate passed 19/19. Repo checks passed 146. Format
  and check-all are green. All runs were under the lock. No allow was added outside
  `fixture-guard.spec.ts`.
- **Principles:** this is a test-only change, and contracts are unchanged. Carry-over: T-0420's
  `uf-03-list-summary.spec.ts` must pass AC1 and AC3 on rebase. The orchestrator checks this at
  T-0420's merge.
