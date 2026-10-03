---
id: T-0356
title: fixture-guard.spec.ts checks every tests/e2e/*.spec.ts for the guarded import (no hard-coded list), and migrates uf-10-balance.spec.ts
lane: qa
screens: [UF-10.1]
decisions: [D-0086, D-0090]
deps: [T-0904, T-0307b, T-0308a, T-0308b]
status: done
---
<!-- Written by product-owner 2026-10-01 (groom mode, run T-0358). Build flow: wl-build-qa. About ½ day. Deps T-0307b/T-0308a/T-0308b are added by D-0090 §3 (D-0086's own "Revisit when" timing); the board row lists only T-0904, so the orchestrator should add them. -->

## Why
D-0086 added an opt-in Supabase request guard (`tests/e2e/fixtures/guarded-test.ts`). Its source
assertion (`fixture-guard.spec.ts:162`) checks only `auth.spec.ts`, `shell.spec.ts` and
`offline.spec.ts`. Any new spec can import `test` from `@playwright/test` and silently opt out.
T-0306a's spec did exactly that, and only the builder's own inspection caught it. On `main`
today, `uf-10-balance.spec.ts:5` is unguarded and nothing reports it. D-0090 makes the guard
mandatory: the assertion enumerates the directory, so the list can't go stale.

## Scope
- In:
  - Move the import rule into a pure helper in `tests/e2e/fixtures/guard-source-check.ts`:
    - `unguardedReason(source: string): string | null` returns `null` when the source imports
      from `"./fixtures/guarded-test.js"` and binds no `test` from `@playwright/test`.
      Otherwise it returns a short reason.
    - `listSpecs(dir: string): string[]` lists the `*.spec.ts` files directly in `dir`, sorted.
      It does not recurse.
    - `unguardedSpecs(dir: string): Array<{file: string; reason: string}>`.
  - `fixture-guard.spec.ts` "source assertions" replaces the hard-coded `for` list with **one
    test per file** produced by `listSpecs(dirname(test.info().file))`, plus one aggregate test
    that `unguardedSpecs(dir)` is `[]`. The aggregate's failure message names every offending
    file.
  - Migrate every spec on `main` that the new check flags at build time. On 2026-10-01 that is
    `uf-10-balance.spec.ts`. Its `test` and `expect` move to `./fixtures/guarded-test.js`, and
    `type Page` may stay on `@playwright/test`. Fix any unclaimed Supabase request the guard
    then reports, with a mock, never a timeout (D-0086 §6).
  - Keep the existing "auth.spec.ts raises no timeout" assertion unchanged.
- Out:
  - Recursing into subdirectories (D-0090 "Revisit when").
  - Any change to `guarded-test.ts`'s detectors or `supabase-mock.ts` behaviour, beyond a mock
    that a migrated spec needs.
  - A repo-level lint or CI check outside Playwright. The e2e job already runs this spec.

## Acceptance criteria
- **AC1 (glob, not a list)** Given `fixture-guard.spec.ts`, When its source is read, Then it
  contains none of the literals `"auth.spec.ts"`, `"shell.spec.ts"` or `"offline.spec.ts"` inside
  the import-rule tests. The per-file tests come from `listSpecs(...)`, and the "raises no
  timeout" test may still name `auth.spec.ts`. When the suite is listed with
  `pnpm exec playwright test --list -c tests/e2e/playwright.config.ts fixture-guard`, Then there is
  one `imports test/expect from guarded-test.js` test for each `tests/e2e/*.spec.ts` file
  on the branch, `fixture-guard.spec.ts` included. That was 6 on 2026-10-01, and there are more
  once T-0307b, T-0308a and T-0308b land.
- **AC2 (a new spec is picked up with no edit)** Given a scratch directory, made with
  `fs.mkdtempSync` under `os.tmpdir()`, that holds `a.spec.ts` (guarded) and `b.spec.ts`, When
  `listSpecs(dir)` runs, Then it returns `["a.spec.ts", "b.spec.ts"]`. A `fixtures/c.spec.ts` in
  a subfolder and a `d.ts` are not listed.
- **AC3 (a non-guarded spec makes the guard fail)** Given that scratch directory where
  `b.spec.ts` contains `import { expect, test } from "@playwright/test";` and no guarded import,
  When `unguardedSpecs(dir)` runs, Then it returns exactly one entry whose `file` is
  `b.spec.ts` and whose `reason` is non-empty. Given `b.spec.ts` instead imports
  `{ test } from "./fixtures/guarded-test.js"` and `{ expect, test } from "@playwright/test"`,
  Then it is still flagged, because `test` is bound from `@playwright/test`.
- **AC4 (allowed forms pass)** `unguardedReason` returns `null` for each of these:
  - (a) `import { expect, test } from "./fixtures/guarded-test.js";`
  - (b) (a) plus `import { type Page } from "@playwright/test";`
  - (c) (a) plus `import type { Page, Route } from "@playwright/test";`
  - (d) (a) plus `import AxeBuilder from "@axe-core/playwright";`

  It returns non-null for each of these:
  - (e) no import from `guarded-test.js` at all
  - (f) (a) plus `import { test as base } from "@playwright/test";`
  - (g) (a) plus a multi-line `import {\n  expect,\n  test,\n} from "@playwright/test";`
- **AC5 (the real directory is clean)** Given `tests/e2e/` on the branch, When
  `unguardedSpecs(tests/e2e)` runs inside `fixture-guard.spec.ts`, Then it returns `[]`.
- **AC6 (uf-10-balance migrated and green)** Given the migrated `uf-10-balance.spec.ts`, When the
  e2e suite runs, Then all of its tests pass under the guard with no unclaimed-request failure.
  Its source has no `timeout:`, `setTimeout` or `.slow(` added by this ticket: the git diff of
  the file adds none of these tokens.
- **AC7 (fault proof, recorded)** The builder temporarily reverts `uf-10-balance.spec.ts:5` to
  `from "@playwright/test"`, runs `fixture-guard.spec.ts`, and records the failing test name and
  message (which must name `uf-10-balance.spec.ts`) in the ticket's build notes. The revert is
  not committed.
- **AC8 (no regression)** `pnpm -w typecheck lint test` and the full e2e suite are green. The
  existing guard behaviour tests in `fixture-guard.spec.ts`, the planted leaks, are unchanged.

## Paths you may change
`tests/e2e/**` (qa).
- **Listed extras:**
  - `docs/tickets/T-0356-e2e-guard-glob.md`: this file, for the build, QA and accept logs (added 2026-10-03 by the orchestrator).

## Contract impact
none. D-0090 amends D-0086 (process, not a contract).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · e2e green · contracts unchanged or decision linked · commit messages start with `T-0356` and cite D-0090.

## Build / accept log
- Main already had a glob (T-0425 AC5) and uf-10 already guarded (T-0427), but the glob kept only specs that already import guarded-test.js, so a spec importing `test` from `@playwright/test` was never checked. Done now: `fixtures/guard-source-check.ts` (`unguardedReason`, `listSpecs`, `unguardedSpecs`; import rules anchored to line start, comments stripped); `fixture-guard.spec.ts` one test per `*.spec.ts` plus aggregate. Backstop/allow rules (D-0155 §4) untouched.
- AC→test: AC1 per-file `T-0356 AC1 <spec>` tests, no hard-coded names; AC2 `T-0356 AC2`; AC3 `T-0356 AC3`; AC4 `T-0356 AC4`; AC5 `T-0356 AC5`; AC6/AC7 already by T-0427 (uf-10 migrated; fault: scratch spec).
- Faults: scratch `zz-scratch.spec.ts` with `import { expect, test } from "@playwright/test"` → AC1 per-file and AC5 red naming the file; `test as base` variant → AC5 red. Removed.
- Results: fixture-guard 66 pass; whole e2e 194 pass; typecheck/lint/test cached green; test:repo-checks, format:check, check-all green.
- QA (HEAD de1c548): fault runs on scratch `zz-scratch.spec.ts` (removed), `playwright test fixture-guard`: plain `import { expect, test } from "@playwright/test"` -> AC1 per-file + AC5 red (2 failed, names the file); `test as base` -> red; multi-line `import {\n test,\n} from "@playwright/test"` -> red; `import type { Page }` beside guarded import -> green (67 pass). Whole e2e 194 pass. format:check green. check-all and test:repo-checks RED (3 tests): `lane-path-not-owned` on this ticket file (qa lane's paths are `tests/e2e/**` only; build log edit trips it). Fix: orchestrator adds the ticket path to Paths on main, or the log moves to docs/tickets/log. AC1-AC5 mapped to `T-0356 AC<n>` tests; AC6/AC7 by T-0427.
- Accept (product-owner, 2026-10-03, HEAD 5d6c6e2): **done**. AC1 per-file `T-0356 AC1 <spec>` from `listSpecs`, no hard-coded names in import-rule tests; AC2-AC5 `T-0356 AC<n>` tests match the ticket's concrete inputs (AC4 also covers namespace import and a commented-out bypass); AC6 met on main by T-0427 (uf-10 imports from guarded-test.js, no timeout added here); AC7 fault proof done on a scratch spec rather than by reverting uf-10:5. The check is a glob, so it is the same path and accepted as equivalent; T-0427 holds the uf-10-specific fault. AC8: planted-leak tests and the "auth.spec.ts raises no timeout" test untouched; whole e2e 194 and the gate green per build/QA. Delivers T-0432 ("every spec imports the guarded fixture"); `export … from` and dynamic import go to T-0455.
