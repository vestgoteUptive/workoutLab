---
id: T-0630
title: "Shared .wl-sheet: stack above the tab bar, style a scrim portalled to body, and keep plan type sizes for a plan sheet nested in a lift or rest root (before UF-08.3/UF-05.1 adopt the sheet)"
lane: web-shell
screens: [UF-05.1, UF-08.3, UF-08.5]
decisions: [D-0210, D-0216]
deps: []
status: ready
---
## Why
D-0216 addendum, plus the T-0593 and T-0608 reviews:
- `.wl-sheet` (z 2) and its scrim (z 1) sit under the tab bar (z 5).
- The scrim is styled only under a `[data-wl-state]` ancestor, so a scrim portalled to `body` gets no styles.
- The lift and rest type overrides (main.css around lines 443 and 478) would resize a plan sheet nested in a lift or rest root.

UF-08's Add sheet (T-0600) and UF-05's Swap sheet (T-0602) need this fixed before they adopt `.wl-sheet`.

## Scope
- In (`apps/web/src/main.css`, `apps/web/src/components/**` if the sheet has a component, and `apps/web/src/app/__tests__/main-css.test.ts`):
  - The sheet and its scrim stack above the tab bar.
  - The scrim is styled when it is portalled to `body` while a sheet is open (for example a `.wl-sheet-scrim` class that does not need a state ancestor, using plan tokens).
  - A `.wl-sheet[data-wl-state="plan"]` inside a lift or rest root keeps the plan type roles and sizes.
- Out: any screen adoption (T-0600 and T-0602 do that).

## Acceptance criteria
- AC1 In an e2e fixture with the tab bar shown, an open sheet and its scrim cover the tab bar: the tab bar is not hit-testable and the sheet's top layer wins at the tab bar's position.
- AC2 A scrim portalled to `body` has the plan scrim colour (plan.scrim at the documented alpha). Planted fault: removing the rule fails it.
- AC3 A plan sheet inside `[data-wl-state="lift"]` has the plan h2/label sizes, not the lift overrides. Same for rest. Planted fault: removing the guard fails it.
- AC4 Unmigrated screens are unchanged (D-0210). Reduced motion: no transitions are added.

## Paths you may change
- `apps/web/src/main.css`, `apps/web/src/app/__tests__/main-css.test.ts`, `apps/web/src/components/**`
- `tests/e2e/cobalt-surfaces.spec.ts`

## Contract impact
None.

## Definition of done
Gate green · full e2e green · commits start with `T-0630`.

## Build / accept log
- Built: sheet z 7, scrim z 6 (tab bar 5); `.wl-sheet-scrim` unscoped (scoping test exempts exactly it); plan type restore rules for a plan sheet in lift/rest.
- AC1: unit z-order + e2e elementFromPoint at tab. AC2: unit + e2e scrim alpha .45 with no state ancestor. AC3: unit + e2e computed sizes (lift and rest). AC4: no transitions added; other rules untouched.
- Planted faults (copies of main.css): scrim re-scoped -> AC1/AC2 unit red; z 2 -> AC1 red; guard selector removed -> AC3 red; all three together -> 3 e2e red. Restored from copy.
- Gate, repo-checks, format, check-all exit 0; full e2e 593 passed.
