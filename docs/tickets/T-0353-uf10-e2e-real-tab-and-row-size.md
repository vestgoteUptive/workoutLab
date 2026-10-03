---
id: T-0353
title: "UF-10 e2e: reach the C-01 buttons with real Tab presses (AC-A16 wording) and check a balance row's boundingBox is at least 44 × 44 (AC-A14)"
lane: web-feature:UF-10
screens: [UF-10.1, UF-10.2]
decisions: [D-0060, D-0158, D-0169, D-0174]
deps: [T-0307a]
status: ready
---
<!-- Groomed 2026-10-03 by product-owner from the T-0307a accept follow-up (D-0174 §6).
Build flow: wl-build-web. About ¼ day. T-0307a is on main. Test-only. -->

## Why
T-0307a's AC-A16 says "Tab to the C-01 hamstrings button". The spec actually calls
`locator.focus()` (`tests/e2e/uf-10-balance.spec.ts`), which proves the Enter/Space handler but
not that the buttons can be reached from the keyboard (NFR-A11Y-2, WCAG 2.1.1). AC-A14's 44 × 44
touch target is checked only through computed CSS in jsdom, never in a real layout.

## Scope
- In: `tests/e2e/uf-10-balance.spec.ts` only.
  - The AC-A16 test reaches the hamstrings button by Tab and the calves button by more Tab
    presses. It makes no `focus()` call on either path.
  - A new row-size test.
- Out:
  - Any change under `apps/web/src/**`. If a button turns out to be unreachable by Tab, the ticket
    returns `failed` with a follow-up for the UF-10 lane. Don't fix it here.
  - The attention-row focus test (`row.focus()` stays as it is; it tests `:focus-visible`
    colour, not reachability).

### Edge cases that are in scope
- **Cold start:** the map buttons are disabled while the cache read is in flight, and disabled
  buttons are skipped by Tab. Wait for `toBeEnabled()` before the first Tab (AC-1).
- **Zero history:** the row-size check runs on the zero-history fixture as well as the mixed one
  (AC-2).

## Acceptance criteria
Each new or changed test title starts with `T-0353 AC-n`.

- **AC-1 (Tab reaches the map, D-0174 §6)** **Given** `/balance` with the mixed fixture, after the
  hamstrings button is enabled and the body has focus, **when** the test presses Tab one at a
  time, at most 40 times, until `document.activeElement` is
  `[data-variant="full"] button[data-area="hamstrings"]`, **then** it gets there. The test fails
  with the number of presses it made if it doesn't. Enter then lands on `/balance/hamstrings`, and
  one `goBack()` returns to `/balance`, as today. After the return, Tab is pressed again until the
  calves button has focus (same 40 cap, counted from the body). Space lands on
  `/balance/calves`, the 150 ms check confirms there was no second navigation, and one `goBack()`
  returns. Neither path contains `.focus()`; record the grep in the build log.
- **AC-2 (row size, AC-A14)** **Given** `/balance` with each fixture (zero, mixed), **then** the
  first `[data-part="row"]` has a `boundingBox()` with `width >= 44` and `height >= 44`, and so does
  the first row with `[data-attention="true"]` in the mixed fixture.
- **AC-3 (proof)** Plant a fault on a backup copy of `apps/web/src/features/UF-10/balance.css` or
  of the C-01 button styles, whichever sets the size: shrink the row's `min-height` to 20px. AC-2
  must fail. Then add `tabindex="-1"` to the hamstrings button on a backup copy of
  `components/body-map`: AC-1 must fail at the 40-press cap. Restore both from the backups and
  record each run.

## Paths you may change
- **Listed extras:**
  - `tests/e2e/uf-10-balance.spec.ts`
  - `docs/tickets/T-0353-uf10-e2e-real-tab-and-row-size.md`

## Contract impact
None.

## Definition of done
- Tests for every AC pass.
- `uf-10-balance.spec.ts` is green 3 times in a row (`--repeat-each=3`) through
  `scripts/locked.sh heavy` (D-0169).
- `-w format:check` and `node .github/scripts/check-all.mjs` are green. Only an e2e spec changes,
  so the full `-w` gate isn't needed (D-0158).
- Commits start `T-0353` and cite UF-10.1.

## Notes
- **Parallel.** T-0354 shares this lane but not a file (`features/UF-10/index.tsx`). Run them one
  after the other, in either order.

## Build / accept log
