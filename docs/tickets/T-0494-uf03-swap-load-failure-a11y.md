---
id: T-0494
title: "UF-03.1 swap-load failure state (SwapLoadBoundary): axe finds 0 violations and the console carries only the expected boundary lines"
lane: web-feature:UF-03
screens: [UF-03.1, UF-05.1]
decisions: [D-0142, D-0162, D-0178, D-0180]
deps: [T-0478]
status: ready
groomed: 2026-10-05
---
<!-- Written by product-owner 2026-10-05 (groom mode, D-0180 §3). Build flow: wl-build-web.
About 1 hour. Test-only unless axe finds a real violation. D-0178: small, self-proven diff. -->

## Why
T-0478 gave the List view's own Swap a failure state: when the `SwapSheet` chunk can't load,
`SwapLoadBoundary` (`apps/web/src/features/UF-03/ListView.tsx`) shows "Couldn't load
alternatives." with **Try again** and **Close** inside a `role="status"` region. T-0478's AC-3
axe test (`list-view.swap.test.tsx`, "axe finds 0 violations on UF-03.1 with the Swap button
showing") only covers the normal card. Its QA noted that the failure state, which a user on a
stale deploy or a flaky connection will actually see mid-workout, has no axe check and no check
of the console on first failure (only the Try-again path checks `console.error`).

## Scope
- In:
  - `apps/web/src/features/UF-03/__tests__/list-view.swap-retry.test.tsx`: a new
    `describe("T-0494 …")` block that reuses the file's `mount()`/`openSwap()` and the failing
    `vi.mock("../../UF-05/index.js")`, plus `axeViolations` from `./list-helpers.js`.
  - `apps/web/src/features/UF-03/ListView.tsx`, `SwapLoadBoundary.render` only, **only if** the
    new axe test finds a real violation on unfixed `main`. Then make the smallest markup fix
    (no copy change, no new strings), record the red run, and say what changed in the log.
- Out:
  - Focus management on entering the failure state (where focus lands when the boundary
    catches). If the builder thinks it's wrong, file a follow-up; don't change it here.
  - `lazy-retry.ts` and its UF-09 twin (T-0495).
  - The real `SwapSheet`'s own data-load failure state (UF-05 lane).
  - e2e: this is a jsdom check, like T-0478's AC-3 one (T-0369 tracks the real-browser axe gap
    for jsdom misses in general).

## Acceptance criteria
**Test rules.** Vitest, titles start "T-0494 AC-n". `axeViolations()` runs with the same options
as T-0478's (colour contrast off in jsdom). Run with
`scripts/locked.sh small npx vitest run src/features/UF-03/__tests__/list-view.swap-retry.test.tsx`
from `apps/web` (run `node apps/web/ensure-tokens-css.mjs` from the root first in a fresh
worktree).
- **AC-1 (axe on the failure state)** Given the UF-05 import fails, When the user taps
  "Swap Back squat" and "Couldn't load alternatives." shows, Then `axeViolations()` returns `[]`,
  and the region has `role="status"` and contains buttons named exactly "Try again" and "Close".
- **AC-2 (axe after a failed retry)** Given AC-1's state, When "Try again" is tapped and the import
  fails again, Then the failure state shows again and `axeViolations()` returns `[]`.
- **AC-3 (console on first failure)** Given the same flow as AC-1, Then every `console.error`
  call made between `mount()` and the failure text appearing matches
  `/Failed to fetch|error occurred|SwapLoadBoundary/` (no `act(...)` warning, no key or prop
  warning), and `console.warn` was not called.
- **AC-4 (fault proof)** On a backup copy of `ListView.tsx`, add `aria-hidden="true"` to the
  boundary's `role="status"` div. Then AC-1 is red with `aria-hidden-focus` in the returned list.
  Restore with `cp`; AC-1 green again. Record both runs.
- **AC-5 (no regression)** The file's four existing T-0478 AC-1 tests and
  `list-view.swap.test.tsx` pass unedited.

## Paths you may change
- `apps/web/src/features/UF-03/__tests__/list-view.swap-retry.test.tsx`
- `apps/web/src/features/UF-03/ListView.tsx` (`SwapLoadBoundary` markup only, and only per Scope)
- `docs/tickets/T-0494-uf03-swap-load-failure-a11y.md` (build log only)

## Contract impact
None.

## Definition of done
AC-1..AC-5 hold and are recorded · the `-w` gate once before handback
(`npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
`-w format:check`, `node .github/scripts/check-all.mjs`) · no e2e run (test-only, or one markup
attribute; if `ListView.tsx` changes, run `tests/e2e/uf-03-list-summary.spec.ts` only) · commits
start `T-0494 UF-03.1:`.

## Notes
- The mocked import throws in the module factory, so `loader.failing` must stay `true` for AC-1
  to AC-3 (the `beforeEach` already sets it).
- Assert axe after `findByText` resolves, not right after the click: the boundary renders on the
  next commit.

## Build / accept log

**2026-10-05 frontend-dev.** Added `T-0494 AC-1/AC-2/AC-3` tests to `list-view.swap-retry.test.tsx`
(reusing `mount()`/`openSwap()`/`makeCtx` and `axeViolations` from `list-helpers.js`). No
`ListView.tsx` change: the normal-path axe test found no real violation on unfixed `main`
(AC-1/AC-2 pass with `axeViolations()` returning `[]`).

Placement note: the three new tests had to be inserted **before** the file's existing "recovers"
test (last of the T-0478 AC-1 block), not after it as a new top-level `describe`. Once "recovers"
succeeds, `swapSheetLoader`'s underlying `lazy()` (`retryableLazy`, `componentDidCatch` calls
`reset()` only on a caught failure, never on success) stays resolved to the real module for the
rest of the file — a later mount would show the real `SwapSheet` dialog regardless of
`loader.failing`. Confirmed by running the new tests appended after "recovers" first: 3/3 failed
trying to find "Couldn't load alternatives." because the real dialog rendered instead. Moved them
immediately before "recovers" (same `describe`, same module-load order) — 7/7 green. The four
existing T-0478 tests are unedited (AC-5), only relocated relative to new tests.

AC→test map: AC-1 → "T-0494 AC-1: axeViolations() returns [], role=status, …"; AC-2 → "T-0494
AC-2: axeViolations() returns [] when Try again fails again"; AC-3 → "T-0494 AC-3: console.error
calls match the expected lines; console.warn unused"; AC-5 → unedited run of the file's four
T-0478 tests + `list-view.swap.test.tsx` (20/20 passed together).

**AC-4 fault proof, and a finding (no decision filed — `.squad/decisions/**` is the `process`
lane's path, not `web-feature:UF-03`'s; see follow-up below instead).** Backed up `ListView.tsx`
(`cp`), added `aria-hidden="true"` to `SwapLoadBoundary`'s `role="status"` div, reran AC-1/AC-2:
red, as the ticket asks — but via AC-1's own `getByRole("status")` / `getByRole("button", …)`
assertions (which Testing Library's role queries refuse to find once `aria-hidden` hides the
subtree), not via `axeViolations()`. Measured directly (not assumed): `axeViolations()` stayed
`[]` throughout; the finding appears only in axe's `results.incomplete` as `aria-hidden-focus`,
never in `results.violations`, in jsdom — axe-core's `aria-hidden-focus` rule depends on
`isModalOpen()`, which needs real layout (`elementsFromPoint`) jsdom doesn't implement, so the
check returns "can't tell" rather than "fails" no matter the markup (tried hidden ancestor div,
hidden button itself, and a concurrently-rendered real `[aria-modal=true]` dialog — all stayed
`incomplete`). No change made to the shared `axeViolations()` helper (used by several other
passing tests; broadening it to fail on `incomplete` is a different lane's helper and a bigger
blast radius than this ticket). Restored `ListView.tsx` with `cp`; AC-1 green again (confirmed
`git diff --stat` on `ListView.tsx` is empty post-restore). Both runs recorded below.

Red run (fault planted): `list-view.swap-retry.test.tsx -t "T-0494"` → 2 failed (AC-1, AC-2) | 1
passed (AC-3, which doesn't touch the hidden buttons) | 4 skipped.
Green run (restored): full file → 7 passed (7).

Gate: `-w typecheck lint test --concurrency=1` green, `-w test:repo-checks` green, `-w
format:check` green, `node .github/scripts/check-all.mjs` green (see summary below for exact
counts). No e2e run: test-only diff, `ListView.tsx` unchanged (per DoD).
