---
id: T-0474
title: "UF-09 reads focus prefs from the UF-08 leaf entry `index.prefs.ts`, so focus mode no longer evaluates SessionSetup (unblocks T-0303c's gate)"
lane: web-feature:UF-09
screens: [UF-09, UF-08.4]
decisions: [D-0170, D-0071, D-0119, D-0158, D-0169]
deps: []
status: ready
---
<!-- Written 2026-10-03 by triage (TR-0044 → D-0170). Build flow: wl-build-web. About an hour. -->

## Why
`features/UF-09/device.ts` imports `readFocusPrefs` and `FocusPrefs` from the UF-08 barrel
(`features/UF-08/index.tsx`). Evaluating the barrel runs `SessionSetup.tsx`. Once T-0303c adds a
static `SwapSheet` import there, three UF-09 tests that mock `../../UF-05/index.js` with a
throwing factory collect 0 tests, and the full gate hangs (TR-0044). D-0170 adds a side-effect-free
leaf entry, `features/UF-08/index.prefs.ts`. UF-09 imports that instead. Behaviour is unchanged.

## Scope
- In:
  - **New** `apps/web/src/features/UF-08/index.prefs.ts`: `export { readFocusPrefs,
    writeFocusPrefs } from "./focus-prefs.js";` and `export type { FocusPrefs } from
    "./focus-prefs.js";`, with a header comment citing D-0170.
  - **New** `apps/web/src/features/UF-08/__tests__/index-prefs.test.ts`: the pin test (AC-2).
  - `apps/web/src/features/UF-09/device.ts`: the import becomes `../UF-08/index.prefs.js`. The
    line-2 comment says "through the UF-08 leaf entry (D-0170)" instead of "through the UF-08 index
    (D-0071 §3)".
  - **New** UF-09 regression test `apps/web/src/features/UF-09/__tests__/t0474.prefs-leaf.test.ts`
    (AC-1, AC-3).
- Out:
  - `features/UF-08/index.tsx`, `SessionSetup.tsx`, `focus-prefs.ts`, or any other existing UF-08
    file.
  - `apps/web/eslint.config.mjs` and `app/__tests__/import-bans.test.ts` (web-shell, T-0475).
  - Any existing UF-09 test (T-0463 AC-5 pins `t0422.*` and `t0451.*` as unedited), **except**
    `t0304g.device.test.tsx`'s `import * as uf08` and `vi.mock` specifiers, which AC-4 below
    retargets (TR-0045).

## Acceptance criteria
Each new test title starts with `T-0474 AC-n`.

- **AC-1 (decoupled, red on main)** In `t0474.prefs-leaf.test.ts`,
  `vi.mock("../../UF-08/SessionSetup.js", () => { throw new Error("SessionSetup evaluated"); })`,
  then `await import("../device.js")` resolves and exports `useFocusDevice`. **Red:** on `main`
  before the fix, the import rejects because the barrel evaluates `SessionSetup.js`. Record the
  red run.
- **AC-2 (leaf entry pinned)** `Object.keys(await import("../index.prefs.js")).sort()` equals
  `["readFocusPrefs", "writeFocusPrefs"]`, and both are the same function objects (`toBe`) as the
  ones from `../focus-prefs.js`. `features/UF-08/__tests__/exports-and-lint.test.ts` passes
  unedited (index.tsx still exports exactly `["SessionSetup", "readFocusPrefs",
  "writeFocusPrefs"]`, and the UF-08 lint and literal scans stay green with the new file).
- **AC-3 (lint)** `ESLint.lintText` over `device.ts`'s source, at its real path, reports no
  `no-restricted-imports`. `device.ts`'s source doesn't match `/UF-08\/index\.js/` or
  `/UF-08\/focus-prefs/`. Contrast: the same lint over a one-line `import { readFocusPrefs } from
  "../UF-08/focus-prefs.js"` at `src/features/UF-09/x.ts` reports it.
- **AC-4 (no regression)** Every existing `features/UF-09/__tests__/*` and
  `features/UF-08/__tests__/*` test passes, including the device and prefs tests from T-0304g and
  T-0303d. **Named exception (TR-0045):** `t0304g.device.test.tsx`'s `import * as uf08 from
  "../../UF-08/index.js"` and its `vi.mock("../../UF-08/index.js", …)` both retarget to
  `../UF-08/index.prefs.js`. No other line in that file changes, and the same `readFocusPrefs`
  call counts and return values are asserted as before — the mock must observe the same specifier
  `device.ts` now imports, nothing else.

**Planted fault.** On a backup copy of `device.ts`, put the import back to `../UF-08/index.js`.
AC-1 must fail, then restore from the copy (`cp`). Record it.

**Cross-check for TR-0044 (log only, not an AC).** In a scratch merge of this branch with
`t/T-0303c-swap-before-starting`, `npx vitest run` on `t0422.lazy-reject.test.tsx`,
`t0451.next-open.test.tsx` and `t0451.next-entry.test.tsx` each collects and passes. Run it with
`scripts/locked.sh small` and record the result. Don't commit the merge.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`).
- **Listed extras (D-0170 §4):**
  - `apps/web/src/features/UF-08/index.prefs.ts` (new)
  - `apps/web/src/features/UF-08/__tests__/index-prefs.test.ts` (new)
  - `docs/tickets/T-0474-uf09-focus-prefs-leaf-entry.md`

## Contract impact
None.

## Definition of done
Every AC has a passing test. The full gate runs once (D-0158): `scripts/locked.sh heavy npx -y
pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and
`node .github/scripts/check-all.mjs` all pass. Whole web e2e isn't needed. Commits start
`T-0474` and cite UF-09.

## Notes
- **Parallel.** This ticket shares no file with T-0303c (UF-08), T-0463 or T-0304h (UF-09), or
  T-0468. It must merge before T-0303c. T-0303c then merges `main` and reruns its gate.

## Build / accept log

### 2026-10-03 frontend-dev — blocked by TR-0045, needs-triage
Built all four listed files: `UF-08/index.prefs.ts` (new leaf entry), its pin test
`UF-08/__tests__/index-prefs.test.ts`, `UF-09/device.ts`'s import + comment switched to
`../UF-08/index.prefs.js`, and `UF-09/__tests__/t0474.prefs-leaf.test.ts`.

AC→test map:
- AC-1 → `t0474.prefs-leaf.test.ts` "T-0474 AC-1 … resolves and exports useFocusDevice even when
  SessionSetup.js throws on evaluation".
- AC-2 → `UF-08/__tests__/index-prefs.test.ts`, both its tests; `exports-and-lint.test.ts` run
  unedited (passes, confirms `index.tsx`'s export set untouched).
- AC-3 → `t0474.prefs-leaf.test.ts`, the "AC-3" describe block (lint real source, regex scan, and
  the contrast case).
- AC-4 → **fails**: see TR-0045 below.

Red-on-main proof (AC-1): ran `t0474.prefs-leaf.test.ts` against `device.ts` with the import
reverted to `../UF-08/index.js` (planted fault, see below) — the AC-1 test fails with "There was
an error when mocking a module… Caused by: Error: SessionSetup evaluated", exactly the mechanism
TR-0044/D-0170 describe. Confirms the fix is load-bearing.

Planted fault: backed up `device.ts` (`cp`), edited the import back to `../UF-08/index.js`, ran
`scripts/locked.sh small npx vitest run src/features/UF-09/__tests__/t0474.prefs-leaf.test.ts` →
2 failed (AC-1, and the AC-3 regex-scan test), 2 passed (the lint-rule tests, since
`../UF-08/index.js` is itself lint-legal — expected, that's a different assertion). Restored
`device.ts` from the backup copy (`cp`, not `git checkout`).

Green run with the fix in place: `scripts/locked.sh small npx vitest run
src/features/UF-09/__tests__/t0474.prefs-leaf.test.ts
src/features/UF-08/__tests__/index-prefs.test.ts
src/features/UF-08/__tests__/exports-and-lint.test.ts
src/features/UF-08/__tests__/focus-prefs.test.ts` → 4 files, 40 tests, all passed.

**AC-4 regression found, filed as TR-0045 (needs-triage).** `scripts/locked.sh heavy npx vitest
run src/features/UF-09/__tests__ src/features/UF-08/__tests__` → 79 passed, 1 failed:
`t0304g.device.test.tsx`, 3 tests in its "AC-1 the prefs are read once per mount" describe, each
asserting on `uf08.readFocusPrefs` after `vi.mock("../../UF-08/index.js", …)` wraps it as a spy.
Switching `device.ts` to `index.prefs.js` means that spy is never the function `device.ts` calls,
so the three assertions see 0 calls. Confirmed this is caused by this ticket's change, not
pre-existing: reverted `device.ts`'s import to `../UF-08/index.js` (same backup-and-restore
`cp` pattern) and reran `t0304g.device.test.tsx` alone → 17 passed, 0 failed. This file predates
D-0170/TR-0044 entirely (`git log`: one commit, `b08aa20`, from T-0304g) and neither document's
analysis covers it — TR-0044 scoped only the three UF-05-mocking tests that hang the gate. AC-4
of this ticket and the AC-1/AC-3 fix the ticket itself mandates are not simultaneously
satisfiable without editing `t0304g.device.test.tsx`, which both AC-4's wording and the Scope ›
Out line forbid. Full analysis, evidence and a recommended fix (retarget the test's mock/import
to `index.prefs.js`, a 2-line, behaviour-preserving edit) are in
`.squad/triage/TR-0045-t0474-device-test-mocks-uf08-barrel.md`.

State left in the worktree: all four new/edited files above are in place and uncommitted (not
committed, since the gate cannot go green). `device.ts` currently imports `../UF-08/index.prefs.js`
(the intended fix, not the planted-fault state). No commit made on this branch yet. Full gate
(`-w typecheck lint test`, etc.) not run, since the known AC-4 failure would make that run
meaningless; re-run it once TR-0045 resolves.
