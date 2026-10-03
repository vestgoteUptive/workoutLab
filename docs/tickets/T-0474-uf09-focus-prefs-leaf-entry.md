---
id: T-0474
title: "UF-09 reads focus prefs from the UF-08 leaf entry `index.prefs.ts`, so focus mode no longer evaluates SessionSetup (unblocks T-0303c's gate)"
lane: web-feature:UF-09
screens: [UF-09, UF-08.4]
decisions: [D-0170, D-0071, D-0119, D-0158, D-0169]
deps: []
status: done
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

### 2026-10-03 frontend-dev — resumed after TR-0045 resolution, done
Resumed on `main` merged into this branch (HEAD `e1a7a83` at the time), carrying forward T-0474's
four already-committed files unchanged. Applied TR-0045's recommended option 1 exactly, in
`t0304g.device.test.tsx`: retargeted only the `import * as uf08` specifier (line 8) and the
`vi.mock(...)` call's specifier plus its `typeof import(...)` type-cast argument (same statement,
same specifier) from `../../UF-08/index.js` to `../../UF-08/index.prefs.js`. No other line in the
file changed — confirmed via `git diff` (3 insertions, 3 deletions, exactly those two statements).
Same `readFocusPrefs` function, same call counts and return values asserted as before; this is the
named exception T-0474's AC-4 and Out-of-scope line now carry (TR-0045 Resolution).

AC-4 → test map (this session): `t0304g.device.test.tsx` run alone — 17 passed, 0 failed (all
three previously-failing "AC-1 the prefs are read once per mount" tests pass again, same
assertions). Full `features/UF-09/__tests__` + `features/UF-08/__tests__` run — 80 files, 1189
tests, all passed: no other regression.

Commands run:
- `scripts/locked.sh small npx vitest run src/features/UF-09/__tests__/t0304g.device.test.tsx`
  (run from `apps/web`) → 1 file, 17 passed.
- `scripts/locked.sh heavy npx vitest run src/features/UF-09/__tests__ src/features/UF-08/__tests__`
  (run from `apps/web`) → 80 files, 1189 passed.
- Committed the two-line retarget (`abde17f`): `T-0474: retarget t0304g.device.test.tsx's mock to
  UF-08 leaf entry (TR-0045)`.
- Full cached gate: `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test
  --concurrency=1` → 19/19 tasks successful, 16 cached; web test run (233 files, 3343 tests)
  passed; typecheck passed.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks` → 159/159 passed.
- `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w format:check` → found one pre-existing
  formatting issue in `t0474.prefs-leaf.test.ts` (a long `expect(...).toEqual([])` chain from the
  earlier session, unrelated to this session's edit). Fixed with `npx prettier --write` (3
  lines, no logic change), reran the file's test (4 passed), reran `format:check` (clean),
  committed (`1e4a9ec`).
- `scripts/locked.sh heavy node .github/scripts/check-all.mjs` → exit 0.
- Reran the full gate once more after the format fix (cache-aware): `scripts/locked.sh heavy npx
  -y pnpm@10.28.2 -w typecheck lint test --concurrency=1` → 19/19 tasks successful, 16 cached
  (web test + typecheck served from Turbo cache keyed off the formatted file), landing suite
  (115 tests) ran fresh and passed.

**Verdict: done.** Every AC has a passing test (AC-1/AC-2/AC-3 unchanged from the earlier session;
AC-4 now green with the named TR-0045 exception). Full gate green. No contract changed.

### 2026-10-03 qa-tester — verified, done
Branch not behind `main` (merge-base = `main` HEAD `b9e4a47`); no merge needed. AC→test map
confirmed by reading each test: AC-1/AC-3 → `t0474.prefs-leaf.test.ts`; AC-2 →
`index-prefs.test.ts` + unedited `exports-and-lint.test.ts`; AC-4 → full `UF-09`/`UF-08`
`__tests__` run incl. retargeted `t0304g.device.test.tsx`. Confirmed scope: `git diff main
--name-only` lists exactly the 6 files the ticket/TR-0045 permit.

Reproduced recorded red-on-main / planted fault: backed up `device.ts` (`cp`), reverted its import
to `../UF-08/index.js`, ran `scripts/locked.sh small npx vitest run
src/features/UF-09/__tests__/t0474.prefs-leaf.test.ts` → 2 failed (AC-1 "SessionSetup evaluated",
AC-3 regex scan), 2 passed — matches the log exactly. Restored from backup (`cp`).

Own planted fault (per task): fresh backup of `device.ts`, same import revert to
`../UF-08/index.js` (breaks the real decoupling), ran `scripts/locked.sh small npx vitest run
src/features/UF-09/__tests__/t0304g.device.test.tsx` → 3 failed (the same three "AC-1 the prefs
are read once per mount" tests TR-0045 documents, "Number of calls: 0"), 14 passed. This proves
TR-0045's retargeted mock in `t0304g.device.test.tsx` watches the live specifier `device.ts`
actually imports, not a vacuously-passing stale mock. Restored from backup (`cp`); `git status`
clean afterward.

Green re-runs: `scripts/locked.sh small npx vitest run t0474.prefs-leaf.test.ts
index-prefs.test.ts exports-and-lint.test.ts focus-prefs.test.ts t0304g.device.test.tsx` → 5
files, 57 passed. `scripts/locked.sh heavy npx vitest run src/features/UF-09/__tests__
src/features/UF-08/__tests__` → 80 files, 1189 passed (matches the builder's recorded count
exactly).

No e2e run: this ticket owns no screen and changes no UI-visible behaviour (an internal import
path swap, AC-1–AC-4 fully proven at unit level); existing UF-09 e2e specs
(`uf-09-focus.spec.ts`, `uf-09-ready.spec.ts`) are owned by other tickets and untouched by this
diff. Per D-0158/qa-tester §1, did not rerun the full `-w` gate or merge `main`.

**Verdict: done.** Every AC maps to a real, passing test; the TR-0045 exception is proven to be a
live, behaviour-preserving retarget, not a vacuous pass. No gaps found.

### 2026-10-03 code-reviewer — approve
Reviewed `t/T-0474-uf09-focus-prefs-leaf-entry` (HEAD `402e811`) against this ticket, D-0170 and
TR-0045's resolution. Static review plus a targeted rerun.

- **Lane/scope:** changed paths are `UF-08/index.prefs.ts` (new), `UF-08/__tests__/index-prefs.test.ts`
  (new), `UF-09/device.ts`, `UF-09/__tests__/t0474.prefs-leaf.test.ts` (new) and
  `UF-09/__tests__/t0304g.device.test.tsx` — exactly the ticket's "Paths you may change" plus the
  TR-0045-named exception. `UF-08/index.tsx` has zero diff against `main` (`git diff main...HEAD --
  apps/web/src/features/UF-08/index.tsx` is empty): T-0303c's AC-8 export set
  `["SessionSetup", "readFocusPrefs", "writeFocusPrefs"]` still holds, confirmed live by
  `exports-and-lint.test.ts`'s own AC-13 export test, run unedited.
- **index.prefs.ts is a genuine leaf entry (D-0170 §1):** five lines, two re-export statements from
  `./focus-prefs.js`, no component, no other feature, nothing from `src/app`. `focus-prefs.ts`
  itself (read) has no runtime imports at all (only a type-only comment, confirmed by its own header),
  so the leaf entry pulls in nothing beyond that one file — side-effect-free end to end.
- **t0304g.device.test.tsx retarget is specifier-only:** diffed against `main` — 3 insertions/3
  deletions, exactly the `import * as uf08` specifier (line 8) and the `vi.mock(...)` call's
  specifier plus its `typeof import(...)` cast (same statement). No assertion, call-count or
  return-value line changed. Matches TR-0045's resolution exactly.
- **New pin test is real:** `index-prefs.test.ts`'s `Object.keys(mod).sort()` assertion would fail
  on an added/removed/renamed export; its second test (`toBe` identity against `focus-prefs.js`'s
  functions) would fail if the leaf re-exported a wrapper instead of the same function object.
- **Targeted rerun** (after restoring one line of accidental uncommitted worktree drift on
  `device.ts` back to HEAD's committed state, via `git checkout -- device.ts`, unrelated to this
  review's verdict): `scripts/locked.sh small npx vitest run
  src/features/UF-09/__tests__/t0474.prefs-leaf.test.ts
  src/features/UF-08/__tests__/index-prefs.test.ts
  src/features/UF-09/__tests__/t0304g.device.test.tsx
  src/features/UF-08/__tests__/exports-and-lint.test.ts` (run from `apps/web`) → 4 files, 41 tests,
  all passed.

No lane, contract, correctness, principle, test-weakening or RLS/security issue found. **Verdict:
approve.**

### 2026-10-03 product-owner — accept, done
Checked the delivered diff (`git diff main --stat`, 6 files: the 4 ticket-listed paths, the
TR-0045-named exception `t0304g.device.test.tsx`, and this ticket file) against the ACs.

- AC-1 → `t0474.prefs-leaf.test.ts`'s "resolves and exports useFocusDevice even when
  SessionSetup.js throws" test; red-on-main and planted-fault proof recorded by both build
  sessions and reproduced independently by QA.
- AC-2 → `index-prefs.test.ts` (both tests, incl. `toBe` identity against `focus-prefs.js`) plus
  unedited `exports-and-lint.test.ts` staying green, confirming `index.tsx`'s export set and
  T-0303c's AC-8 are unaffected.
- AC-3 → `t0474.prefs-leaf.test.ts`'s AC-3 describe block (real-source lint, regex scan, contrast
  case).
- AC-4 → full `UF-09`/`UF-08` `__tests__` run (80 files, 1189 tests) green, including the
  TR-0045-named, specifier-only retarget in `t0304g.device.test.tsx` (3+/3- lines, no assertion
  changed) — proven non-vacuous by QA's own planted fault (3 failures when the retarget is
  reverted).

Gate: full cached `-w typecheck lint test`, `-w test:repo-checks`, `-w format:check` and
`check-all.mjs` all green (builder's session, after the TR-0045 fix and a prettier fix both
landed). No contract touched. TR-0045 resolved via D-0170's own named exception, not a
work-around — review and QA both independently confirmed the retarget is specifier-only.

**Verdict: done.** Every AC has a passing, non-vacuous test; gate green; no contract drift;
lane/scope match the grant exactly.
