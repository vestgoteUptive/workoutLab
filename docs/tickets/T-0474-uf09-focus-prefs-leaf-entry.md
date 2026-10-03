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
