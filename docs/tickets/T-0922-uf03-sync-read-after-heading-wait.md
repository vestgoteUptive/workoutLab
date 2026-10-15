---
id: T-0922
title: "UF-03 tests: no synchronous read right after a heading wait (T-0663 race), plus a guard test"
lane: web-feature:UF-03
screens: [UF-03.1]
decisions: [D-0158, D-0178]
deps: []
status: ready
---
## Why
T-0663 (merged `3e0a3551`) fixed one instance of a test race in `list-view.swap.host.test.tsx`. The test waited for the card's `<h2>` to flip to "Hip thrust", then read "Set 1 weight in kg" **synchronously**. On a loaded machine the heading commits before the row inputs, so the `getByRole` threw. T-0663 changed only that one read to `findByRole`. The same shape is still in UF-03's tests: a "ready" wait on a heading, then a synchronous `screen.getBy*` for a *different* element, with no ready-signal wait in between. It only shows under heavy CPU load (journal 2026-10-13). This ticket finds every instance, fixes it, and adds a cheap guard test so the shape can't come back.

## Scope
- In:
  - Audit every `apps/web/src/features/UF-03/__tests__/*.test.tsx` for the pattern defined below, and fix each hit.
  - Add one source-scan guard test to the same folder.
- Out:
  - Production code under `features/UF-03` (test-only ticket).
  - ESLint config (`apps/web/eslint.config.mjs` is web-shell's; a lint rule is a possible later follow-up).
  - Other flows' tests.
  - The broader "wait for a `[data-screen-id]` anchor, then read synchronously" shape. List it in the audit, but leave it unguarded.

**The pattern, exactly.** A *heading wait* is either:
- an `await waitFor(` whose callback (one or more lines, up to its closing `)`) contains `getByRole("heading"`; or
- an `await screen.findByRole("heading"` call.

A *ready-signal await* is a line with `await waitFor(`, `await screen.findBy`, `await screen.findAllBy` or `await findEl(`. Other awaits, such as `await settle()` (a 50 ms sleep in `list-helpers.tsx:127`) or an IDB read, are **not** ready signals.

A hit is a synchronous `screen.getBy…(` or `screen.getAllBy…(` call that appears after a heading wait and before the next ready-signal await in the same test. If the read is legitimately in the same React commit as the heading, it may stay. It then needs a marker `// same-commit: <reason>` (non-empty reason) on the read's line or the line above.

**Audit command** (starting list; the guard test is the precise check):
`grep -rn -A4 -E 'await (waitFor\(.*heading|screen\.findByRole\("heading")|getByRole\("heading"' apps/web/src/features/UF-03/__tests__`

Known hits on `main` at 8f51449d (all in `list-view.swap.host.test.tsx`):
- **L118→L119.** `findByRole` heading "Back squat", then `getByRole` button "Swap Back squat".
- **L259→L261.** Heading wait for "Hip thrust", then `await settle()`, then `getByRole` button "Swap Hip thrust" compared with `document.activeElement`. Focus moves in a separate effect (`ListView.tsx:719`), so the read is a 50 ms timing bet.
- **L289→L290.** Same as L118.

The builder confirms or extends this list. Fix a hit by turning the read into `await screen.findBy…` or, for focus, `await waitFor(() => expect(document.activeElement).toBe(screen.getByRole(…)))`. Prefer a fix over a marker.

## Acceptance criteria
- **AC1 (guard flags the shape).** Given the guard's scanner and an inline fixture source:
  ```
  await waitFor(() => screen.getByRole("heading", { level: 2, name: "X" }));
  await settle();
  expect(screen.getByRole("button", { name: "Y" })).toBeTruthy();
  ```
  When it is scanned, Then it reports exactly 1 finding on line 3.
- **AC2 (multi-line wait).** Given a fixture whose heading wait is
  ```
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy(),
  );
  ```
  and the next line is a synchronous `screen.getByRole("textbox", …)` read, When it is scanned, Then it reports 1 finding. Given the same fixture with `screen.findByRole("heading", …)` as the wait, Then it also reports 1 finding.
- **AC3 (ready signal clears it; the T-0663 fixed shape).**
  - Given a heading wait, then `expect(await screen.findByRole("textbox", { name: "Set 1 weight in kg" }))…`, then a synchronous `screen.getByRole("textbox", { name: "Set 1 reps" })`, When it is scanned, Then it reports 0 findings.
  - Given a heading wait with **no** read before the test ends (`});`), Then it reports 0 findings.
- **AC4 (marker).**
  - Given the AC1 fixture with `// same-commit: Swap button and h2 render in one card commit` on the line above the read, Then 0 findings.
  - Given the bare `// same-commit:` with an empty reason, Then 1 finding.
- **AC5 (real files are clean, non-vacuously).** Given every `*.test.tsx` in `apps/web/src/features/UF-03/__tests__/`, When the guard scans them, Then it reports 0 findings. It also asserts that it read ≥ 10 files and that ≥ 3 heading waits were seen, so a broken glob or regex fails instead of passing empty.
  - Planted fault: put L261 back to the synchronous `screen.getByRole("button", { name: "Swap Hip thrust" })` after `await settle()`, in a backup copy (restore with `cp`). The guard goes red and names `list-view.swap.host.test.tsx:<line>`. Restored, it goes green.
- **AC6 (each fixed site is still a real assertion).** For every hit fixed in this ticket, the test still fails when its assertion is wrong. Planted fault for L261: change the expected name to "Swap Back squat". `npx vitest run` on that file goes red, then green when restored. One line per site in the log.
- **AC7 (load evidence, not a test).** Use the T-0924 load recipe: 8 busy loops (`yes > /dev/null` × 8), then `scripts/locked.sh small npx vitest run src/features/UF-03/__tests__/list-view.swap.host.test.tsx` 10 times. Record the pass count in the log (target 10/10). A failure here is evidence of another hit; it is never a reason to raise a timeout.

Binary-condition check (D-0197 §7):
- Marker present/absent: AC4 covers both values.
- Hit/no hit: AC1/AC2 versus AC3 cover both.
- Online/offline does not apply: the guard is a static scan.

## Paths you may change
- `apps/web/src/features/UF-03/__tests__/**`

## Contract impact
none

## Definition of done
- Every AC is covered by a test in `apps/web/src/features/UF-03/__tests__/wait-then-read.guard.test.ts`. That file uses `// @vitest-environment node`, reads its siblings with `readdirSync` on its own directory, and keeps the scanner as a pure function in the file. AC6 and AC7 are proven in the log.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` are green.
- No production file changes.
- Commits start `T-0922 UF-03.1:`.
- E2E is not needed (no `apps/web/src` runtime change).

## Build / accept log

### Build (frontend-dev)
- Start: worktree clean, HEAD 46095991. Audit: scanner on unfixed `list-view.swap.host.test.tsx` flagged exactly L119, L261, L290 (no other file hits; the wider audit grep shows only those). No extra hits.
- Fixes (test-only, `list-view.swap.host.test.tsx`): L119/L290 `getByRole` -> `await screen.findByRole` (Swap Back squat); L261 `settle()` + sync read -> `await waitFor(() => expect(document.activeElement).toBe(screen.getByRole(...)))`. Guard: `wait-then-read.guard.test.ts` (scanner pure fn, 7 tests).
- AC->test: AC1/AC2/AC3/AC4 = "T-0922 scanner" tests (AC2 covers waitFor and findByRole variants; AC3 covers findBy ready signal, end-of-test and next-test; AC4 covers reason, empty reason, same-line marker); AC5 = "T-0922 AC-5" block (>=10 files, >=3 heading waits, 0 findings).
- Planted faults (backup copy, restored with cp): unfixed file -> guard red naming :119, :261, :290. Only L261 restored to `settle()`+sync -> guard red naming `list-view.swap.host.test.tsx:261`. Restored -> green.
- AC6 per site (wrong name planted, then restored): L261 "Swap Back squat" -> 1 red (AC-3 focus test); L119 (openSwap) "Swap Nothing" -> 8 red; L291 (was L290) "Swap Nothing" -> 1 red (AC-1 rest/cancel test). Baseline 9/9 green.
- AC7 load (8x `yes`, 4 cores, 10 runs of the swap.host file): before further fix 4/10 then 9/10 (the failures were NOT a sync-read: the first test of the file timed out on the cold dynamic `import("../UF-05/index.js")` the host loads for the Swap sheet, `Unable to find dialog "Replace Back squat"`, later the 5 s test budget). Fix: `beforeAll` warm-up importing UF-05 and UF-04 index (no timeout raised). After: 10/10, then 10/10 again (that batch ran swap.host + guard together).
