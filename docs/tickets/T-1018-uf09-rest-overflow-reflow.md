---
id: T-1018
title: "UF-09.5 rest screen overflows sideways at 320 px with 200 % zoom (timer and −15 s/+15 s row wider than the page)"
lane: web-feature:UF-09
screens: [UF-09.5]
decisions: [D-0273]
deps: []
status: ready
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
