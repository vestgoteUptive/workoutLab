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
