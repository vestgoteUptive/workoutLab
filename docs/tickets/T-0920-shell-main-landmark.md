---
id: T-0920
title: "Shell: one <main> landmark around routed screens so axe region/landmark-one-main pass"
lane: web-shell
screens: [UF-02.1]
decisions: [D-0208]
deps: [T-0638]
status: doing
---
<!-- Written by the orchestrator 2026-10-13 (T-0638 follow-up). Small. -->

## Why
The shell renders no `<main>`, so axe's `region` and `landmark-one-main` rules flag every element on every screen. T-0638 had to exclude both rules in `uf-02-today.spec.ts:1396`.

## Scope
- **In:** the app shell (`App.tsx` / route layout) wraps the routed screen outlet in exactly one `<main>` (no extra visual box: no margin, padding or background of its own). The tab bar, skip link and any shell chrome stay outside `<main>`; the skip link (if present) targets it. Remove the two-rule exclusion at `tests/e2e/uf-02-today.spec.ts:1396`.
- **Out:** feature screens adding their own landmarks; nested `<main>`s (a screen root must not also be `<main>`; if one is, report it).

## Acceptance criteria
- **AC1.** Every routed screen has exactly one `main` landmark containing its `data-screen-id` root (vitest over the route table or the shell render test).
- **AC2.** Today's axe run in `uf-02-today.spec.ts` passes with no rule excluded.
- **AC3.** No layout change: the `visual-foundation.spec.ts` gutter/no-overflow checks and the focus-mode size checks pass unchanged; the tab bar is outside `main`.
- **AC4.** The full web e2e suite passes; no role/name/order/focus assertion changes except ones that counted landmarks (logged).

## Paths you may change
- `apps/web/src/app/**`, `apps/web/src/components/**`, `apps/web/src/main.css` (lane / listed extra)
- `tests/e2e/uf-02-today.spec.ts` (remove the exclusion only)
- `docs/tickets/T-0920-shell-main-landmark.md` (log only)

## Contract impact
none

## Build / accept log
- Build (Sonnet): `Shell` in App.tsx wraps `<Routes>` in one plain `<main>` (no styles; tab bar and AccountDeletedNotice outside). No skip link exists in the shell. Removed the region/landmark-one-main exclusion in uf-02-today.spec.ts.
- AC1: routes.phase3.render.test.tsx "T-0920 AC1" (10 routes incl. UF-09, UF-08.1; one main, contains root, tab bar outside). AC2: uf-02-today.spec.ts AC5 axe, no exclusion. AC3/AC4: full e2e 672 passed.
- Faults: main->div in App.tsx: AC1 test red (10 fails), AC2 axe red (landmark-one-main, region). Restored from backup.
- Nested main: none in non-test source (only test wrappers).
- Gate: -w typecheck lint test 0, test:repo-checks 0, format:check 0, check-all 0, full e2e 0.
