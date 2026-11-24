---
id: T-1018
title: "UF-09.5 rest screen overflows sideways at 320 px with 200 % zoom (timer and −15 s/+15 s row wider than the page)"
lane: web-feature:UF-09
screens: [UF-09.5]
decisions: [D-0273]
deps: []
status: done
---
## Why
Found by T-0991 (2026-11-24). At a 160 × 284 CSS-px viewport (320 px at 200 % zoom, WCAG 1.4.10 reflow) the rest page scrolls sideways: `scrollWidth` 186 > 160 with a 16 px root font, and 351 with a 200 % root font. The timer is wider than its box; with the larger root font the −15 s / +15 s row and the Skip rest arrow overflow too. The Next block itself wraps correctly. This predates T-0990.

## Acceptance criteria
- AC1 At 160 × 284 (16 px root font and 200 % root font) the rest page has no horizontal scroll (`scrollWidth <= innerWidth`), and the timer, −15 s / +15 s and Skip rest stay fully visible and at least 44 px tall.
- AC2 At 390 × 844 the timer keeps its current size (the timer stays the largest element, D-0273); only narrow widths scale it down (e.g. `clamp()` or container units, tokens only).
- AC3 The four `test.fail` markers T-0991 added in `tests/e2e/uf-09-rest-next.spec.ts` are removed and those tests pass.
- AC4 The lift state (UF-09.3) is unchanged.

## Paths you may change
- `apps/web/src/features/UF-09/**`
- `tests/e2e/uf-09-rest-next.spec.ts`

## Contract impact
none.

## Definition of done
Every AC has a test · affected checks green (D-0285) · commit messages start with `T-1018`.

## Build / accept log
- Build (2026-11-24): cause: the rest timer's `clamp(5rem, 36vw, …)` floor is in rem, so it grew with the root font past a 160 px viewport; at 160 px the Next block's 3.5rem load line also overflowed (scrollWidth 273 with a 32 px root). Fix in `uf-09.css` only: timer `min(36vw, 9.375rem)` (no floor; 390 px unchanged at 150 px), −15 s/+15 s grid `auto-fit minmax(min(100%, 6rem), 1fr)` with wrapping, Skip rest smaller padding/font and wrapping below 380 px, load line and unit scale with vw below 320 px. Lift state untouched (all rules are under `[data-wl-state="rest"]`). AC1: two new 160 px tests (16 px and 200 % root) plus the page-level ones; AC2: new 390 x 844 test (timer 150 px, largest font); AC3: four `test.fail` removed, 22 pass; AC4: no lift rule or file changed (diff). Red before fix: new AC1 tests and the unmarked page tests failed (scrollWidth 273). Faults: timer floor `clamp(5rem, …)` re-added -> 6 fail; adjust row `min-inline-size: 20rem` -> 6 fail; both restored with cp and cmp.
