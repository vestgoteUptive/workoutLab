---
id: TR-0045
status: resolved
raised_by: frontend-dev on T-0474
date: 2026-10-03
---
## Conflict
T-0474 (D-0170 §3) requires `features/UF-09/device.ts` to import `readFocusPrefs`/`FocusPrefs`
from the new leaf entry `../UF-08/index.prefs.js` instead of the `../UF-08/index.js` barrel.
T-0474's own AC-4 requires every existing `features/UF-09/__tests__/*` test to pass **unedited**,
"including the device and prefs tests from T-0304g and T-0303d." These two requirements cannot
both hold: making the AC-1/AC-3 import switch breaks three tests in
`features/UF-09/__tests__/t0304g.device.test.tsx` (pre-existing since T-0304g, commit `b08aa20`,
unrelated to T-0303c/TR-0044/D-0170), and fixing those three tests needs editing that file.

### Evidence
- `t0304g.device.test.tsx` line 41: `vi.mock("../../UF-08/index.js", async (orig) => { const real
  = (await orig()) as …; return { ...real, readFocusPrefs: vi.fn(real.readFocusPrefs) }; });` — a
  spy on `readFocusPrefs` scoped to the `UF-08/index.js` specifier only. The test file imports
  `* as uf08 from "../../UF-08/index.js"` (line 8) and asserts on `uf08.readFocusPrefs` directly
  (`toHaveBeenCalledTimes`, `toHaveReturnedWith`).
- With `device.ts` unmodified (still importing `../UF-08/index.js`, i.e. `main` today):
  `scripts/locked.sh small npx vitest run src/features/UF-09/__tests__/t0304g.device.test.tsx` →
  17 passed, 0 failed.
- With `device.ts` importing `../UF-08/index.prefs.js` (the D-0170 §3 / T-0474 AC-1 fix): the same
  command → 14 passed, 3 failed, all three in `describe("AC-1 the prefs are read once per mount")`:
  - "over a full rest, readFocusPrefs is called once; a second host mount calls it once more" —
    `expected "vi.fn()" to be called 1 times, but got 0 times`.
  - "the default: with nothing stored, all three are on" — `toHaveReturnedWith` sees 0 calls.
  - "the pair: all three false …" — same, 0 calls.
  - The other 14 tests in the file (AC-2 wake lock, etc.) pass either way: they assert on
    `lock`/`audio`/`speech` stubs, not on `uf08.readFocusPrefs` directly.
- Root cause: `device.ts` now calls `readFocusPrefs` from the `index.prefs.js` module instance.
  Vitest's `vi.mock("../../UF-08/index.js", …)` replaces only the `index.js` module graph; it
  never touches `index.prefs.js`, a separate specifier with its own re-export of the same
  underlying `focus-prefs.js` function. The spy the test installs is never the function
  `device.ts` calls, so it records zero calls.
- Confirmed by direct test run, not inferred: both runs above were executed in this worktree,
  `device.ts` restored by `cp` from a backup between them (no uncommitted change lost).

### Why this can't be fixed inside the granted scope
- T-0474's "Paths you may change" lists `features/UF-09/**`, plus two named UF-08 extras
  (`index.prefs.ts`, its pin test) and the ticket file itself. `t0304g.device.test.tsx` is an
  existing UF-09 test, explicitly **excluded** by the ticket's own Out-of-scope line ("Any
  existing UF-09 test (T-0463 AC-5 pins `t0422.*` and `t0451.*` as unedited)") and by AC-4's
  "unedited" wording, which names this exact file.
- D-0170 and TR-0044 analysed only the three UF-05-mocking tests that poisoned the gate
  (`t0422.lazy-reject`, `t0451.next-open`, `t0451.next-entry`). Neither document mentions
  `t0304g.device.test.tsx` or its barrel-level mock of `readFocusPrefs`. This is a gap in that
  analysis, not a disagreement with it: the decision's §3 fix (change the import) is sound for the
  stated problem, but it has a second consequence outside what TR-0044 scoped.
- There is no way to make `device.ts` import the leaf entry (as §3 requires) while leaving this
  test's `vi.mock("../../UF-08/index.js", …)` able to observe the call, because the mock and the
  import now target different specifiers by design — that is the entire point of the leaf entry
  (D-0170 §1: "modules behind it import no other feature... nothing from `src/app`", a separate,
  parallel module graph from `index.tsx`'s).

### Options
1. **Edit `t0304g.device.test.tsx`'s mock and import to target `../UF-08/index.prefs.js` instead
   of `../UF-08/index.js`.** Minimal: two lines (the `import * as uf08` specifier and the
   `vi.mock` specifier). Behaviour asserted is unchanged — same underlying `readFocusPrefs`
   function, same call counts, same return values. This amends T-0474's AC-4 (one named exception)
   and its Out-of-scope line, the same way D-0156 §3 and D-0170 §4 each named a precedent
   exception for one file. Lowest risk, smallest diff, no product-facing change.
2. **Leave `index.tsx` still importing/exporting `readFocusPrefs` and have `device.ts` import from
   both `index.js` and `index.prefs.js`, picking one at runtime.** Rejected: pointless
   complexity, and reintroduces the barrel evaluation D-0170 exists to avoid.
3. **Make the leaf entry re-export the live binding from `index.tsx` instead of
   `focus-prefs.js` directly**, so mocking `index.js` also substitutes what `index.prefs.js`
   resolves to. Rejected: that reintroduces the `SessionSetup.tsx` evaluation D-0170 exists to
   remove (the entire point of the leaf entry is to *not* route through `index.tsx`).
4. **Revert T-0474's import change and leave TR-0044 open.** Rejected: undoes the whole point of
   this ticket and D-0170, and does not fix the original hang.

### Recommendation
Option 1. It is a two-line, behaviour-preserving edit to one pre-existing test file, consistent
with D-0170's intent (same functions, same call semantics — the test only needs to watch the
right specifier). Suggest a decision amending T-0474 AC-4 to carve out this one file by name, the
same way D-0170 itself named precedent exceptions (D-0156 §3).

## Blocking
- T-0474: AC-1 and AC-3 are implemented, proven and green in isolation (see ticket log), but the
  full `features/UF-09/__tests__` run has 3 failing tests while `device.ts` points at the leaf
  entry. The ticket cannot reach "every AC has a passing test" + "no regression" (AC-4) at the
  same time without this resolved.
- T-0303c transitively: it is blocked on T-0474 merging to `main` (D-0170 §4), so it is blocked on
  this too.

## Resolution
Option 1, by the orchestrator (2026-10-03): the conflict is a gap in TR-0044/D-0170's own
analysis, not a disagreement between sources, and the fix is a two-line, behaviour-preserving
retarget of one test's mock specifier with no product-facing effect — no separate decision number
needed. T-0474's AC-4 and Out-of-scope line are amended in place: `t0304g.device.test.tsx` is
named as the one exception, same shape as D-0170 §4's own precedent (D-0156 §3). T-0474 may edit
exactly this file's `import * as uf08` and `vi.mock` specifiers (`../UF-08/index.js` →
`../UF-08/index.prefs.js`), asserting the same `readFocusPrefs` call counts and return values as
today. No other line in the file changes.

## Status
Resolved as above. `device.ts` was left importing `../UF-08/index.prefs.js` (the AC-1/AC-3 fix)
uncommitted in the T-0474 worktree; the builder resumes from there.
