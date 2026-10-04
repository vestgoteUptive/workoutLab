---
id: T-0361
title: "UF-04 source-scan hardening: ban the bare offlineDb identifier and scan subdirectories (T-0306a QA)"
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.2, UF-04.3]
decisions: [D-0067, D-0071, D-0157, D-0158]
deps: [T-0306a]
status: done
---
<!-- Groomed 2026-10-04 by product-owner. Build flow: wl-build-web. About ⅛ day. Test-only, inside one feature folder: no production code, no e2e (D-0158 tiers: the whole web e2e is not needed, since nothing outside `features/UF-04/__tests__/` changes). No path overlap with in-flight T-0478 (UF-03), T-0471 (UF-11) or parallel T-0449 (components/offline-status). -->

## Why
T-0306a QA found two minor, non-blocking gaps in
`apps/web/src/features/UF-04/__tests__/exports-and-lint.test.ts` (AC-16, D-0067 §5):
1. Line 67 matches `/offlineDb\(/`, so `import { offlineDb } from "../../lib/offline/index.js"`
   with no call (or `const db = offlineDb;`) passes. Real misuse (calling it) is caught, and
   `no-unused-vars` would flag a bare import, but an aliased or passed-along reference would not.
2. `sourceFiles()` (lines 24-28) reads only the top level of `features/UF-04/`. UF-04 is flat
   today (11 source files), but a future `features/UF-04/<sub>/x.tsx` would be skipped by every
   AC-16 scan (offlineDb/dexie, jsx-no-literals, `en.uf04` keys, `style=`, hex colours).

## Scope
- In:
  - `exports-and-lint.test.ts` only:
    - Make the file walk recursive. Pull it into a helper that takes a root directory
      (e.g. `sourceFiles(root = FEATURE_DIR)`), descends into subdirectories and skips any
      directory named `__tests__` at any depth. Every existing AC-16 scan uses it.
    - Replace `/offlineDb\(/` with an identifier match, `/\bofflineDb\b/`, through a helper
      (e.g. `idbViolations(source): string[]`) that also keeps the `from ["']dexie["']` check.
      `resetOfflineDbForTest` must not match (it doesn't: no word boundary before `OfflineDb`).
    - New `describe("T-0361 …")` block with the fixture tests below.
- Out:
  - Any production file in `features/UF-04/` (none needs to change: today no non-test UF-04
    file mentions `offlineDb` or `dexie`; the build confirms that with the hardened scan).
  - The ESLint config, `lib/offline/**`, other features' source-scan tests (if the same pattern
    exists elsewhere, file a follow-up, don't fix it here).
  - Banning other `lib/offline` exports (`resetOfflineDbForTest`, `DB_NAME`).

### Edge cases that are in scope
- A file in `__tests__/` nested under a subdirectory (`sub/__tests__/x.ts`) is still excluded.
- A directory that merely contains "tests" in its name (`sub/testsupport/`) is **not** excluded.
- Non-source files (`.md`, `.json`) in a subdirectory are still ignored (the `.(tsx?|css)` filter
  keeps working at depth).

## Acceptance criteria
**Test setup.** Fixtures live in a temp directory made with `mkdtempSync(join(tmpdir(), "t0361-"))`
and removed in `afterEach`/`afterAll` with `rmSync(dir, { recursive: true, force: true })`. Do
**not** write fixture files into `src/features/UF-04/`: other agents lint, typecheck and test the
tree in parallel worktrees, and a leftover file there would break them. The helpers take the root
as a parameter, so the fixture dir stands in for the feature folder.

**Test rules.** Each hardening gets a planted-fault proof recorded in the build log: the old
behaviour restored on a backup copy of the test file (`cp`, restore with `cp`), the AC's test run
red, then restored and green. Run with `scripts/locked.sh small npx vitest run
src/features/UF-04/__tests__/exports-and-lint.test.ts` from `apps/web`.

- **AC-1 (bare identifier caught)** Given a fixture file `a.ts` containing
  `import { offlineDb } from "../../lib/offline/index.js";\nexport const X = 1;\n`, When
  `idbViolations` runs on it, Then it reports exactly one violation. The same holds for
  `const db = offlineDb;` and for `offlineDb()` (the old case still caught) and for
  `import x from "dexie";`. **Planted fault:** the pattern back to `/offlineDb\(/` turns the
  bare-import case red.
- **AC-2 (no false positive)** Given fixture sources `import { resetOfflineDbForTest } from "x";`,
  `import { loadLibrary } from "../../lib/offline/index.js";` and `const offlineDbName = 1;`, When
  `idbViolations` runs, Then each reports zero violations.
- **AC-3 (recursive walk)** Given a fixture root with `top.tsx`, `sub/nested.tsx`,
  `sub/deeper/style.css`, `sub/README.md`, `sub/testsupport/helper.ts`, `__tests__/t.ts` and
  `sub/__tests__/u.ts`, When `sourceFiles(root)` runs, Then it returns exactly `top.tsx`,
  `sub/nested.tsx`, `sub/deeper/style.css` and `sub/testsupport/helper.ts` (compare sorted
  paths relative to the root). **Planted fault:** the walk back to the non-recursive
  `readdirSync(...).filter(e => e.isFile() ...)` turns this red.
- **AC-4 (wired end to end)** Given the fixture root with `sub/nested.tsx` containing
  `import { offlineDb } from "../../lib/offline/index.js";`, When the AC-16 scan logic (walk +
  `idbViolations`) runs over the root, Then it reports one violation naming `sub/nested.tsx`.
  The pair: the same root without that file reports none.
- **AC-5 (real feature still green, nothing weakened)** The existing AC-16 tests now run over
  `sourceFiles()` (recursive) and pass unedited in their assertions; `files.length > 5` and
  `keys.size > 20` stay. No production file under `features/UF-04/` changes
  (`git diff --stat main -- apps/web/src/features/UF-04 ':!apps/web/src/features/UF-04/__tests__'`
  is empty, recorded in the log).

**Gate.** Full gate once before hand-back (D-0158): `npx -y pnpm@10.28.2 -w typecheck lint test
--concurrency=1`, `-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs`.
No e2e: test-only change inside one feature folder.

## Paths you may change
- `apps/web/src/features/UF-04/__tests__/exports-and-lint.test.ts` (lane `web-feature:UF-04`).
- **Listed extras:**
  - `docs/tickets/T-0361-uf04-source-scan-hardening.md`: this file, for the logs.

## Contract impact
None.

## Build / accept log

### Build log (frontend-dev)
- Changed only `exports-and-lint.test.ts`: recursive `sourceFiles(root)` (skips `__tests__` at any depth), `idbViolations()` with `/\bofflineDb\b/` + dexie check, new `T-0361` describe using mkdtemp fixtures removed in afterEach.
- AC-1/AC-2/AC-3/AC-4: the T-0361 describe (19 tests green). AC-5: existing AC-16 tests run over the recursive walk with assertions unchanged (`files.length > 5`, `keys.size > 20` kept); `git diff --stat main -- apps/web/src/features/UF-04 ':!apps/web/src/features/UF-04/__tests__'` is empty.
- Planted fault 1 (pattern back to `/offlineDb\(/`, backup copy restored with cp): red, 3 failed (AC-1 bare import, AC-1 `const db = offlineDb;`, AC-4); restored, green.
- Planted fault 2 (walk made non-recursive): red, 2 failed (AC-3, AC-4); restored, green.

### Code review (code-reviewer, HEAD fd67583)
- Verdict: **approve**. Lane clean (only the test file + this ticket). No contract or production change (`git diff --stat main...HEAD -- apps/web/src/features/UF-04 ':!…/__tests__'` empty). All five existing AC-16 scans use the recursive `sourceFiles()`; assertions unchanged (`> 5`, `> 20` kept). `\bofflineDb\b` does not match `resetOfflineDbForTest` or `offlineDbName`. Fixtures in mkdtemp, removed in afterEach. AC-1..AC-5 each map to a test; both planted faults logged.
- Non-blocking: the build log has no full-gate result line (D-0158); add it before merge.

### QA (qa-tester, HEAD fd67583)
- Verdict: **done**, AC-1..AC-5 proven. Baseline UF-04 file: 19/19 green.
- Fault 1 (pattern back to `/offlineDb\(/`, cp backup/restore): 3 red (AC-1 bare import, AC-1 `const db = offlineDb;`, AC-4). Fault 2 (non-recursive walk): 2 red (AC-3, AC-4). Both restored with cp (cmp identical), 19/19 green.
- AC-5: `git diff --stat c5af22a -- features/UF-04 ':!…/__tests__'` empty; AC-16 assertion lines unedited in diff. No `/tmp/t0361-*` leftovers, nothing written into src/features/UF-04.
- `@workoutlab/web` typecheck and lint: both exit 0.
- Note: builder full-gate line still absent (D-0158).
- 2026-10-04 orchestrator: gate line from the build report (D-0158, cached): `-w typecheck` 7/7, `-w lint` 6/6, `-w test --concurrency=1` 7/7, `-w test:repo-checks`, `-w format:check` and `check-all` all exit 0, each via `scripts/locked.sh`. The forced full gate runs on main after merge.

### Accept (product-owner, HEAD db2ce9f)
- Verdict: **done**. AC-1 → `it.each` "AC-1 reports exactly one violation" (4 cases); AC-2 → `it.each` "AC-2 no false positive" (3 cases); AC-3 → "AC-3 walk is recursive…" (exact sorted set, `__tests__` nested skipped, `testsupport` kept, `.md` ignored); AC-4 → "AC-4 wired end to end" (bad/clean pair); AC-5 → all five AC-16 scans call recursive `sourceFiles()`, assertions unchanged, production diff empty.
- Planted faults 1 and 2 red then green in build and re-done by QA. Fixtures in mkdtemp, removed in afterEach. Gate line present (D-0158). `check-all` exit 0 at acceptance. Principles unaffected (test-only).
