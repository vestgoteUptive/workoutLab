---
id: T-0478
title: "UF-03.1 Swap button on the List view's current card: SwapSheet (with the host's time zone) → ctx.replaceItem, rows after a swap, focus back to Swap"
lane: web-feature:UF-03
screens: [UF-03.1, UF-05.1]
decisions: [D-0142, D-0069, D-0071, D-0093, D-0140, D-0157, D-0158, D-0169, D-0172]
deps: [T-0418, T-0421, T-0414]
status: todo
---
<!-- Split out of T-0418 on 2026-10-03 by product-owner (D-0157 §7, D-0172). It mounts the SwapSheet
component (T-0421) directly, not through a seam, and persists through ctx.replaceItem, whose
free-position rule is T-0414's (D-0140). Build flow: wl-build-web. About ⅓ day. Becomes ready when
T-0418 is done (both edit ListView.tsx). -->

## Why
**UF-05.1 from the List view:** the same single swap sheet as in focus mode (D-0071 §7). The engine
builds the swapped item (principle 3), so the user who logs from the list can still swap a busy
machine without going back to focus mode.

## Scope
- In (`features/UF-03`):
  - **The Swap button** on the current card only (D-0142 §7). It shows `SwapSheet` from
    `features/UF-05/index.tsx` with `{workout: ctx.workout, itemIndex, onApply, onClose,
    timeZone: ctx.timeZone}` in place of the table (one `[data-screen-id]`: `UF-05.1`).
    `onApply(result)` returns `ctx.replaceItem(itemIndex, result.plan.items[itemIndex],
    result.plan.mainLiftId)`, and the sheet closes after it resolves.
  - **Rows after a swap:** logged rows of the old exercise show that exercise's library name as a
    tag. Unlogged rows take the new item's pre-fill.
  - **`ListViewCtx`** gains `workout`, `timeZone`, `replaceItem`, typed structurally (D-0172 §4).
  - **Focus** (D-0172 §3): after Apply or Cancel → that card's "Swap" button.
- Out:
  - The `swap` seam on UF-09.9/UF-09.6 (T-0422, done). The swap semantics (T-0224, D-0093).
  - "Always use this in <routine>" (cut, D-0069 §7).
  - Any `features/UF-09` or `features/UF-05` file.

### Edge cases that are in scope
- **Offline:** the swap persists through `replaceItem` → the queue (AC-2).
- **Time running out:** a swap may pick an "Over your time" candidate (D-0056 §3, T-0421). The time
  check stays in focus mode.
- **Zero history:** the swapped item's pre-fill is the engine's `carry` or `first_time` (R14-E7),
  shown as given (AC-2).
- **A swap during a rest:** the rest bar keeps running across the sheet (AC-1 contrast).

## Acceptance criteria
**Test setup.** T-0417's. The unit tests use a test-built `ctx` (spied `replaceItem`); AC-2 uses the
real host with the real `SwapSheet`, `rankSwaps` and `applySwap`. Each new test title starts with
`T-0478 AC-n`.

**Test rules.** Both values of every binary condition get a test. Negative asserts wait ≥ 50 ms.
Every AC must fail on main's code. The build log records this planted fault turning its AC red: a
second plan write after `replaceItem` (AC-1).

- **AC-1 (Swap from the list, D-0071 §7)**
  - **Opens.** "Swap" on the current back-squat card shows `SwapSheet` with `workout`
    reference-equal to `ctx.workout`, `itemIndex: 0` and `timeZone` equal to `ctx.timeZone`
    (checked with ctx `timeZone` "America/New_York"). The other cards have no Swap button.
  - **Apply.** `onApply(result)` calls `ctx.replaceItem(0, result.plan.items[0],
    result.plan.mainLiftId)` exactly once and returns its promise. There is no other plan write (no
    `upsertSession` import in the List view, the T-0417 AC-4 scan).
  - **Cancel** (the sheet's `onClose`) returns to UF-03.1 with no call.
  - **Rejection.** With `replaceItem` rejecting, the sheet stays open with its rejection text
    (T-0421), and the card still shows back-squat.
  - **During a rest.** With a rest running in the real host, opening and cancelling the sheet
    leaves `ctx.rest` running; the bar shows again on return.
- **AC-2 (after a swap, through the real engine and host)** With back-squat rows 1–2 logged,
  swapping to the first candidate the real `rankSwaps` returns:
  - the card shows the candidate's library name;
  - rows 3–4 (unlogged) show the engine's pre-fill from the new `plan.items[0].prefill`;
  - rows 1–2 keep their values, show the tag "Back squat", and keep `exerciseId "back-squat"` in
    IndexedDB;
  - checking row 3 records the new exerciseId at `setIndex: 2` (the first free position, D-0140);
  - the stored row's plan passes `parseSessionPlan`, and its other fields are deep-equal to before;
  - offline (`navigator.onLine = false`), all of the above holds, and a remount reads the new
    exercise back.
- **AC-3 (focus and a11y)** After Cancel and, separately, after a resolved Apply,
  `document.activeElement` is the back-squat card's "Swap" button (named "Swap Back squat" before,
  "Swap {new name}" after Apply). The vitest axe helper finds 0 violations on UF-03.1 with the Swap
  button showing.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0478-uf03-swap-in-list.md`: this file, for the build and accept logs.
- Read-only imports (not grants): `features/UF-05/index.tsx` (`SwapSheet`), `@workoutlab/shared`
  (`parseSessionPlan`, tests), `lib/offline` (tests).

## Contract impact
None. The plan is persisted by `ctx.replaceItem` as a whole row (D-0071 §6).

## Definition of done
Tests for every AC pass, with the planted fault recorded · while working,
`scripts/locked.sh small npx vitest run <files>` · once before hand-back (D-0158, D-0169):
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`,
`scripts/locked.sh heavy npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check`,
`node .github/scripts/check-all.mjs`, `check:size` on a fresh build (UF-03 now pulls in UF-05), and
`scripts/locked.sh heavy` on the web `test:e2e` for `uf-03-list-summary.spec.ts` and
`uf-09-focus.spec.ts` · contracts unchanged · commits start `T-0478` and cite the screen (for
example `T-0478 UF-03.1: swap from the list`).

## Notes
- **Flow:** `wl-build-web`.
- **Parallel.** After T-0418 (both edit `ListView.tsx`). T-0464, T-0472, T-0473 wait for it too.

## Build / accept log
