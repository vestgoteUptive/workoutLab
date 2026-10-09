---
id: T-0639
title: "UF-04.1 \"Upper\" and \"Legs\" group chips (URL group=, single choice with All and the areas) and a polite \"6 results\" count above the list"
lane: web-feature:UF-04
screens: [UF-04.1]
decisions: [D-0217, D-0069, D-0079, D-0212]
deps: [T-0608]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Exercises" (#turn-3). Spec: docs/specs/cobalt-mock-behaviour.md §3.4. UF-04 folder chain: T-0607 → T-0608 → T-0639 → T-0640. -->

## Why
Nine area chips make "show me leg exercises" four taps. The mock adds group chips and a result count, and the owner promoted them (H-34).

## Scope
- **In:**
  - `Library.tsx`: two chips between "All" and the area chips, "Upper" (chest, back, shoulders, arms) and "Legs" (glutes, quads, hamstrings, calves). A group matches an exercise with weight 1 in any of its areas.
  - All, the groups and the areas are one single-choice set (`aria-pressed`); "My equipment" stays an independent toggle.
  - URL: `group=upper|legs` with `replace`. Pressing a group deletes `area`; pressing an area or All deletes `group`. Both present → `area` wins; an unknown `group` is ignored.
  - A result count `<p role="status" data-part="count">` between the chips and the list: `resultCount(n)` "6 results" / "1 result". Not rendered when no row matches (the existing no-match message shows).
  - Copy in `flows/uf-04.ts`: `chipUpper` "Upper", `chipLegs` "Legs", `resultCount(n)`.
- **Out:** tags (T-0640); "· squat pattern" (rejected, no pattern field); a Core group.

## Acceptance criteria
- **AC1 (Legs).** Given a library with back-squat (quads 1, glutes 1), leg-curl (hamstrings 1), bench-press (chest 1) and plank (core 1), When the user presses "Legs", Then the rows are back-squat and leg-curl, the URL has `group=legs` and no `area`, and "Legs" is the only pressed chip of the set.
- **AC2 (Upper).** "Upper" shows bench-press only; a secondary-only match (weight 0.5 in an upper area) is not shown.
- **AC3 (switching).** From `group=legs`, pressing "Quads" gives `area=quads` with no `group`; pressing "All" removes both. History length is unchanged (`replace`).
- **AC4 (URL edge cases).** `?group=legs&area=chest` shows the chest list with "Chest" pressed; `?group=arms` shows the full list with "All" pressed.
- **AC5 (combines).** `group=legs` with "My equipment" and a profile without a barbell hides back-squat.
- **AC6 (count).** The count reads "4 results" unfiltered, "2 results" for Legs, "1 result" for a search "plank", and is absent for a search with no match (the no-match message shows). Its role is `status`.
- **AC7 (offline).** Offline with a warm cache, AC1 and AC6 behave the same.
- **AC8 (back from detail, e2e).** In `uf-04-library.spec.ts`, Legs → open an exercise → Back returns to the Legs list with the same count.
- **AC9 (a11y).** Axe reports 0 violations; the chip group keeps its name "Filter exercises".
- **AC10 (no regressions).** The UF-04 vitest suite and the UF-04 e2e specs pass.

Checklist (D-0197 §7):
- Group and area, matching and empty results, online and offline, and with and without "My equipment" are all covered.

## Paths you may change
- `apps/web/src/features/UF-04/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-04.ts` (own flow file)
- `tests/e2e/uf-04-library.spec.ts` (listed extra)
- `docs/tickets/T-0639-uf04-group-chips-result-count.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-04-library.spec.ts` green · commit messages start with `T-0639` and cite UF-04.1.

## Build / accept log
