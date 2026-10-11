---
id: T-0607
title: "UF-04.1 Browse and UF-04.3 Compare variants in the plan state: page title with a CSS full stop, search as .wl-input, filters as chips with an aria-hidden tick, results as hairline rows with outline tags, Compare as rows"
lane: web-feature:UF-04
screens: [UF-04.1, UF-04.3]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0199, D-0202]
deps: [T-0593, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Exercises" (#turn-3), "Compare variations" (#turn-5). Behaviour: screens/UF-04.1-UF-04.2.md. The "Exercises" title is T-0622; this ticket keeps today's strings. UF-04 folder chain T-0607 → T-0608. -->
## Why
These are browse screens, so they take the plan look.

## Scope
- **In:**
  - `Library.tsx`, `CompareContent.tsx` and `uf-04.css`.
  - The roots have `data-wl-state="plan"` and `.wl-page`.
  - The title is a page title with `.wl-title--stop`.
  - Search is a `.wl-input` with a Clear text button.
  - The existing filters are `.wl-chip`, with the tick when multi-select.
  - Results are `.wl-row`: the name, a caption of areas and equipment, and the existing "Not suggested" or "Favorite" tag as an outline chip.
  - **Compare:** the title is a section title, the attributes are `.wl-row` pairs, and the back link is a text button.
- **Out:**
  - UF-04.2 and the how-to (T-0608).
  - Copy and library data.
  - The canvas's new filters and tags (D-0212 §4).

## Acceptance criteria
- **AC1 (state).** `/library` and the compare route have `data-wl-state="plan"` and a `plan.bg` `theme-color`.
- **AC2 (search and filters).**
  - The search input has the 1px `plan.ink-muted` boundary.
  - The filter chip names are unchanged, and pressed vs unpressed differ in fill and tick. Both are tested.
  - An empty search result renders the existing empty line in plan.
- **AC3 (tags).** A row with the "Not suggested" tag shows it as an outline chip with its existing text, `plan.ink` on `plan.bg` (8.6). A row without it shows none. Both are tested.
- **AC4 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations on both screens.
  - Rows, chips and Clear are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC5 (behaviour unchanged).** `uf-04-library.spec.ts`, `uf-04-favorites.spec.ts` and the UF-04 vitest suite pass with no role or name change. Offline Compare (T-0905) is still green. The library download message ("downloads the first time you're online") renders when there's no cache, and the list renders when there is.
- **AC6 (visual compare).** `compareWithCanvas` saves "Exercises" (turn-3) and "Compare variations" (turn-5). The log lists the verdicts. Expected deviation: the title stays "Library" until T-0622.

Checklist (D-0197 §7):
- Cache and no cache, online and offline Compare, empty and non-empty search, and tag present and absent are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `apps/web/src/features/UF-04/**` (lane)
- `tests/e2e/uf-04-library.spec.ts` (listed extra)
- `docs/tickets/T-0607-uf04-browse-compare-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-04-library.spec.ts` and `uf-04-favorites.spec.ts` green · commit messages start with `T-0607` and cite UF-04.1/UF-04.3.

## Build / accept log
- Built on main 72304a1 (clean). Library and Compare roots are `data-wl-state="plan"` + `.wl-page`; search `.wl-input` + Clear text button (new strings `uf04.clear`, `uf04.clearSearch` in the flow-owned `lib/i18n/flows/uf-04.ts`); chips `.wl-chip` with an aria-hidden `TickIcon`; rows `a.wl-row` (grid, DOM order name, tag, captions kept so the link name is unchanged); tags are outline chips; Compare keeps its `<table>` (roles unchanged, AC5) with hairline rows, a text-button back link.
- Legacy CSS kept for UF-04.2 (T-0608): `.wl-uf04`, `__list`, `__row`, `__link`, `__pills`, `__tag`, `__sr`, figure card, actions. Removed only classes with no remaining user (`__search`, `__chip(s)`, `__compare`, `__sr-only`, `__row-head/-name/-areas/-muted`). All new rules are scoped to `.wl-uf04-browse` / `.wl-uf04-compare`.
- AC map: AC1 cobalt.test "AC1 state" + e2e AC1 (theme-color); AC2 cobalt "AC2" + e2e AC2 x3; AC3 cobalt "AC3" + e2e AC3; AC4 cobalt "AC4" (pairs from tokens, no px/raw/--wl-color/transition, scope) + e2e axe colour-contrast + text-pair scan, 44 targets, motion 0.2s / 0s; AC5 existing UF-04 suites + uf-04-library/favorites e2e, shell offline Compare unchanged; AC6 e2e canvas compare (verdicts below).
- Planted faults (all red, restored from a backup copy): tag background (unit AC3, e2e AC3); Compare state attribute removed (AC1); unscoped `.wl-row` rule (scope test); Clear always shown (AC2); chip tick class renamed (AC2); transition on chips (unit AC4, e2e motion); title stop content emptied (AC1).
- Red on unfixed code: shell `routes.phase3.render.test` reads `<h1>{en.screens.libraryCompare}</h1>` from UF-04/index.tsx, so the Compare h1 stays bare and its section role and stop are repeated in uf-04.css (scoped). Follow-up: relax that shell test, then use the shared classes.
- Canvas compare (390 x 844): "Exercises": same plan blue, title with stop, chips, hairline rows, captions on one line with dots. Deviations: title "Library" until T-0622; search is a boxed `.wl-input` not an underline (ticket); no "6 results" line, no In plan / Variant / Beginner tags, no "Legs" chip (D-0212 §4); no thumbnails. "Compare variations": the canvas is a stance-and-emphasis layout; the app keeps the attribute table (title "Compare variants", rows as hairline pairs).
