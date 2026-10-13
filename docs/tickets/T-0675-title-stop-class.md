---
id: T-0675
title: "Shell: routes.phase3.render.test accepts a className on the <h1> so UF-03.3, UF-04.3 and UF-06.2 use .wl-title--stop"
lane: web-shell
screens: [UF-03.3, UF-04.3, UF-06.2]
decisions: [D-0208]
deps: [T-0604, T-0607, T-0609]
status: done
---
## Why
The shell test pinned a bare `<h1>` for UF-03.3 and UF-04.3 (and an exact class for UF-06.2), so those screens repeated the `.wl-title--stop` rule in their own CSS. Supersedes T-0669.

## Scope
- In: routes test accepts an optional `className` on the `<h1>`; the three screens take the shared classes; duplicated `::after` rules (and the Compare scoped size rule) are removed.
- Out: other screens, contracts.

## Acceptance criteria
- AC1 Given UF-03.3, When rendered, Then its h1 source has `wl-type-page-title wl-title--stop` and summary.css has no `h1::after` rule.
- AC2 Given UF-04.3, Then its h1 has `wl-type-section wl-title--stop` and uf-04.css has no `.wl-uf04-compare > h1` rule.
- AC3 Given UF-06.2, Then its h1 has `wl-type-page-title wl-title--stop`.
- AC4 Given the routes test, Then a classed h1 passes and a hard-coded literal still fails.

## Paths you may change
- `apps/web/src/app/__tests__/routes.phase3.render.test.tsx`
- `apps/web/src/features/UF-03/{index.tsx,summary.css,__tests__/t0604.css.test.ts}`, `UF-04/{index.tsx,uf-04.css,__tests__/cobalt.test.tsx}`, `UF-06/{ExerciseHistory.tsx,__tests__/t0609.cobalt.test.tsx}` (listed extras)

## Contract impact
none

## Build / accept log
- Build: UF-03 Summary h1 `wl-type-page-title wl-title--stop`, UF-04 Compare h1 `wl-type-section wl-title--stop`, UF-06 ExerciseHistory h1 `wl-type-page-title wl-title--stop wl-progress__title`; duplicated `::after` (and Compare size) rules removed; routes test regex accepts an optional className, UF-06 check made whitespace-tolerant.
- AC1 t0604.css.test.ts; AC2 UF-04 cobalt.test.tsx; AC3 t0609.cobalt.test.tsx; AC4 routes.phase3.render.test.tsx.
- Planted faults (all red, then restored from copy): UF-06 class dropped (routes + t0609), UF-04 class dropped (cobalt), UF-03 literal title (routes x2), local h1::after re-added in summary.css (first attempt passed: selector match too strict, test fixed, then red), `.wl-uf04-compare > h1` re-added (cobalt).
- Gate: typecheck lint test green (19/19); format:check, check-all, test:repo-checks green. E2E uf-03-list-summary, uf-04-library, uf-06-progress: 51 passed (browsers installed to ~/.cache/pwb, config tests/e2e/playwright.config.ts).
