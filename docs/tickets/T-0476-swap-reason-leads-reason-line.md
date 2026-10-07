---
id: T-0476
title: "UF-08.2/UF-08.3: after a swap the row says so — itemReasonLine puts a swap reason first, inside the two-line cap"
lane: web-shell
screens: [UF-08.2, UF-08.3, UF-02.2]
decisions: [D-0197, D-0171, D-0106, D-0109]
deps: [T-0303c]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48 (T-0303c accept follow-up, D-0171).
D-0197 §1 sets the rule. Build flow: wl-build-web. About ⅛ day; small (D-0178). -->

## Why
A swap on UF-08.3 adds a `swap` reason to the item, after `area_deficit` and `days_since`
(engine-rules 12.1). `itemReasonLine` (`apps/web/src/lib/i18n/workout.ts`) keeps the first two
non-empty lines in order, so the swap line is always cut: after "Short on time" the row still reads
"Back 0 % below target · Back not trained yet" and the user can't see the swap took effect
(D-0171). D-0197 §1: a swap line leads, and the cap stays at 2.

## Scope
- In: `itemReasonLine(reasons)`: the first non-empty `swap` line first, then the other non-empty
  lines in `reasons` order, at most 2 in total, joined with " · ". Unchanged when there is no
  `swap` reason.
- In: update the `itemReasonLine` doc comment and the AC-7 tests in
  `lib/i18n/__tests__/workout.test.ts`.
- In: tighten T-0303c's AC-2 assertion in `features/UF-08/__tests__/swap-before-start.test.tsx`
  so the row's reason **contains** "Swapped to save time", and drop the D-0171 comment there.
- Out: the engine's reason order; `reasonLine` copy; `sessionReasonChips`.

## Acceptance criteria
- **AC-1 (swap leads)** Given reasons `[area_deficit back 1.0, days_since back null, swap
  short_on_time]`, then `itemReasonLine` returns `"Swapped to save time · Back 100 % below target"`.
  **Red on main:** it returns `"Back 100 % below target · Back not trained yet"`.
- **AC-2 (every swap reason)** For each swap reason (`null`, `equipment_taken`, `discomfort`,
  `variety`, `short_on_time`) placed last after two other reasons, the line starts with that
  reason's `reasonLine` text and has exactly 2 parts.
- **AC-3 (no swap: the other value)** The existing AC-7 cases with no `swap` reason return exactly
  what they return on main (pin at least `"Main lift · Chest 100 % below target"`).
- **AC-4 (swap alone)** Given `[swap variety, prefill]`, then `"Swapped for variety"` (the empty
  `prefill` line is still skipped).
- **AC-5 (on screen)** In `swap-before-start.test.tsx`'s Short-on-time case, the second row's
  `[data-part="row-reason"]` text contains "Swapped to save time".

## Paths you may change
- `apps/web/src/lib/i18n/workout.ts`, `apps/web/src/lib/i18n/__tests__/workout.test.ts` (the lane:
  `web-shell`).
- **Listed extras:**
  - `apps/web/src/features/UF-08/__tests__/swap-before-start.test.tsx`: the AC-2 reason assertion
    and its comment only.
  - `docs/tickets/T-0476-swap-reason-leads-reason-line.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass, AC-1 and AC-5 red on main (record it) · `pnpm -w typecheck lint test` green
plus `-w test:repo-checks` · the UF-08 e2e spec green · commits start with `T-0476` and cite UF-08.3.

## Build / accept log
