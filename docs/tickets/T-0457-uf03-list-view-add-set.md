---
id: T-0457
title: "UF-03.1 List view \"+ Add set\": a row past the planned and logged sets with the last row's values, logged through ctx.recordSet, and shown again after a reload (D-0142 §3)"
lane: web-feature:UF-03
screens: [UF-03.1]
decisions: [D-0142, D-0164, D-0071, D-0015]
deps: [T-0417]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner. Split from T-0417 by D-0164 §1. Build flow: wl-build-web. About ¼ day. Start from a main that has T-0417. -->

## Why
UF-03.1 lets a user do one more set than planned. D-0142 §3 sets the rule: an added set gets index
`1 + max(the item's last planned index, the item's highest logged setIndex)`, `backoff: false`,
and the last row's values. The rows past the plan come from `ctx.loggedSets`, so an added set that
was logged shows again after a reload.

## Scope
- In (`apps/web/src/features/UF-03/`):
  - A "+ Add set" button at the end of each expanded card's rows.
  - It adds one unlogged row in component state, at the D-0142 §3 index, with the last row's kg
    and reps (or seconds). It is checked, edited and unchecked exactly as T-0417's rows are.
  - Rows for logged sets of the item above the planned positions (D-0142 §3 "one row for each
    logged set of this item above those positions") render from `ctx.loggedSets`, so they survive
    a reload.
  - Strings in `flows/uf-03.ts`.
- Out:
  - Removing an added row that was never logged, beyond collapsing the card (a remount drops it).
  - Any limit on added sets.
  - UF-03.2 rest (T-0418) and the e2e (T-0458).

### Edge cases that are in scope
- **Offline:** an added row records offline like any row (AC-2).
- **Reload:** a logged added set comes back as its row, done. An unlogged added row doesn't (AC-4).
- **Zero history:** an added row on a lift with an empty kg field copies the empty field, and
  T-0417's weight rule disables its toggle (AC-5).
- **Time running out, 10 days off:** no effect beyond T-0417's.

## Acceptance criteria
**Test setup.** T-0416/T-0417's helpers (S1, L1, the clock, the deferred `ctx` spies). Integration
rows use the real host and `fake-indexeddb`, as in T-0417.

**Test rules.** Every AC must fail on T-0417's code (there is no "+ Add set"); the build log
records each red run. It also records this planted fault turning AC-3 red: the added row's index
computed as `item.sets` on an item with a back-off.

- **AC-1 (the added row)** Given back-squat with rows 1–4 done at 100 × 6, 100 × 6, 100 × 5,
  100 × 5, When "+ Add set" is pressed, Then row 5 appears, unchecked ("Mark set 5 done"), with kg
  "100" and reps "5". Its fields are labelled "Set 5 weight in kg" and "Set 5 reps".
- **AC-2 (logging it)** With `navigator.onLine = false`, checking row 5 calls `ctx.recordSet` once
  with `setIndex: 4`, `backoff: false`, `weightKg: 100`, `reps: 5`, `itemIndex: 0`,
  `source: "list"`. Unchecking it afterwards calls `ctx.deleteSet` with that set's `clientId`.
- **AC-3 (the index rule, D-0142 §3)**
  - **With a back-off.** On an item with `backoff` non-null (the back-off row is index 4), the
    added row has index 5. It copies the back-off row's values.
  - **Twice.** Pressing "+ Add set" twice gives indexes 4 and 5.
  - **A logged set above the plan.** With `ctx.loggedSets` already holding back-squat
    `setIndex: 6`, the card shows that row, done, and "+ Add set" gives index 7.
  - **Before the planned rows are done.** With rows 1–4 unlogged, "+ Add set" still gives index 4
    with row 4's pre-fill values.
- **AC-4 (reload)** In the real host, add row 5 on back-squat and check it, then add row 6 and
  leave it unchecked. Remount the host (same storage and IndexedDB) and open the List view: row 5
  shows done with its values, and there is no row 6.
- **AC-5 (zero history)** With `prefill.weightKg: null` and rows 1–4 unlogged, an added row has an
  empty kg field, and its toggle is `aria-disabled="true"` with the T-0417 weight hint.
- **AC-6 (a11y)** "+ Add set" is a `button` reachable by Tab after the last row's toggle. After a
  press, focus moves to the new row's kg field (reps field on a bodyweight item, seconds on a
  timed one). The vitest axe helper finds 0 violations with an added row.

## Paths you may change
- `apps/web/src/features/UF-03/**` (the lane: `web-feature:UF-03`).
- **Listed extras:**
  - `apps/web/src/lib/i18n/flows/uf-03.ts`: this flow's strings file (D-0071 §1); add keys.
  - `docs/tickets/T-0457-uf03-list-view-add-set.md`: this file, for the build and accept logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with the red runs and the planted fault recorded · the cached gate
(D-0158): `pnpm -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check`
and `check-all` green · `uf-03-list-summary.spec.ts` green · contracts unchanged · commits start
`T-0457` and cite UF-03.1.

## Notes
- **Flow:** `wl-build-web`.
- **Parallel:** not with T-0417, T-0458, T-0439 or T-0418 (same lane, one UF-03 ticket at a time,
  D-0164 §1). Allowed by files with T-0394, T-0451, T-0446, T-0448, T-0454 and T-0459.

## Build / accept log
Archived in `docs/tickets/log/T-0457.md` (D-0157).
