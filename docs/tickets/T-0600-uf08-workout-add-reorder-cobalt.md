---
id: T-0600
title: "UF-08.2 Your workout (hairline item rows, time bar without warn, why chips and Favorite tag as outline chips, Remove and Reorder mode) and UF-08.5 Add exercise as the plan sheet; Looks good is the one white primary"
lane: web-feature:UF-08
screens: [UF-08.2, UF-08.5]
decisions: [D-0208, D-0210, D-0211, D-0213, D-0205, D-0199, D-0191, D-0202]
deps: [T-0599]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ½ day. Canvas: "Set up · your workout" (#turn-3); UF-08.5 isn't drawn, so apply the sheet pattern. Behaviour: screens/UF-08.2.md, screens/UF-08.5.md, docs/specs/uf-08-add-and-reorder.md. Restyle only. -->
## Why
UF-08.2 is the densest planning screen. Hairline rows replace the item cards, and the Add sheet becomes the shared plan sheet (T-0593).

## Scope
- **In:**
  - `Suggested.tsx`, `AddExerciseSheet.tsx`, `RemovedLine.tsx`, `rows.ts` (view only) and `uf-08.css`.
  - Items are `.wl-row`: the index, the title, the caption "sets × reps · weight · min", then the trailing Swap (text button) and Remove (an `aria-hidden` cross icon in a 44 px button with its existing name).
  - **The time bar:** an empty track in `--wl-raise`, items in `--wl-ink`, and the warm-up segment in `--wl-ink-muted` with its existing text label. `__seg--warn` is removed (D-0211 §5).
  - The why chips and the "Favorite" tag are non-interactive outline `.wl-chip`s.
  - "Skipping today: …" and the excluded-areas notice use the T-0593 notice.
  - In Reorder mode, the moved row is `--wl-raise` with white text, and the drag handle is an `aria-hidden` icon.
  - **The Add sheet:** `.wl-sheet` with its scrim, the search as a `.wl-input`, and rows as `.wl-row`.
  - "Looks good" is the one white primary.
- **Out:**
  - UF-08.3 (T-0602).
  - Copy, ordering logic and engine calls.

## Acceptance criteria
- **AC1 (state).** The UF-08.2 root has `data-wl-state="plan"`. The open Add sheet has `data-wl-state="plan"`, 28px top radii and the `plan.scrim` 45 % scrim. `theme-color` stays `plan.bg` with the sheet open.
- **AC2 (time bar, no warn).** The warm-up segment's background is `plan.ink-muted`, and the segment keeps its visible label. A computed-colour scan of the screen finds no legacy `warn` or `accent` value.
- **AC3 (reorder).** In Reorder mode, the moved row has a `plan.raise` background and `plan.ink` text (6.2). The order still survives a re-suggest (`uf-08-reorder.spec.ts`, unchanged).
- **AC4 (add sheet).**
  - The sheet is a dialog with its existing name, focus is trapped and returned, and Escape closes it (existing tests).
  - Its search input has the 1px `plan.ink-muted` boundary.
  - Favorites are listed first (existing test).
- **AC5 (one primary, contrast).**
  - One `.wl-button--primary` on UF-08.2.
  - Text on `plan.raise` uses `plan.ink` or `plan.ink-on-raise`, never `ink-muted` (a computed scan).
  - Axe colour-contrast has 0 violations on the screen and on the open sheet.
- **AC6 (targets, type, motion, guard).**
  - Swap, Remove, the handles and the rows are ≥ 44 × 44.
  - No px font size and no raw colour.
  - The sheet opens without a transition, and the cross-fade is instant under reduced motion. Both values are tested.
- **AC7 (behaviour unchanged).**
  - `uf-08-setup.spec.ts`, `uf-08-add.spec.ts`, `uf-08-reorder.spec.ts`, `uf-08-excluded.spec.ts`, `uf-08-favorites.spec.ts` and the UF-08 vitest suite pass with no role or name change.
  - "No exercises left…" (empty after removals) and "Nothing fits" both render in plan.
  - The Removed line and its Undo still work offline (existing test).
- **AC8 (visual compare).** `compareWithCanvas` saves "Set up · your workout" (turn-3), plus app-only shots of Reorder mode and the open Add sheet (no canvas frame; noted in the log).

Checklist (D-0197 §7):
- Empty and non-empty plans, sheet open and closed, Reorder on and off, and online and offline Remove are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `tests/e2e/uf-08-excluded.spec.ts` (orchestrator grant: scope its `getByRole("status")` to the removed line so the page status can stay rendered when empty, not display:none)
- `tests/e2e/cobalt-controls.spec.ts`, `tests/e2e/fonts.spec.ts` (orchestrator grant: their 'unchanged outside a state' checks used a now-migrating screen; move each to an injected no-state fixture, never another real screen)
- `tests/e2e/visual-foundation.spec.ts` (orchestrator grant, for every screen restyle: move this screen's checks from the legacy no-state scale to the plan or state scale, as T-0601/T-0597 did, or to an injected no-state fixture; never use another real screen as the no-state host)
- `apps/web/src/features/UF-08/**` (lane)
- `tests/e2e/uf-08-setup.spec.ts`, `tests/e2e/uf-08-add.spec.ts`, `tests/e2e/uf-08-reorder.spec.ts` (listed extras)
- `docs/tickets/T-0600-uf08-workout-add-reorder-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · the UF-08 e2e specs green · commit messages start with `T-0600` and cite UF-08.2/UF-08.5.

## Build / accept log

### Build log (frontend-dev, base 563c379, tree clean at start)
- Built: UF-08.2 root `data-wl-state="plan"` + `.wl-page`; hairline `.wl-row` items (index, title, caption, Swap `.wl-button--text`, Remove `CrossIcon` in a 44px button, names unchanged); time bar track `--wl-raise`, items `--wl-ink`, warm-up `--wl-ink-muted`, `__seg--warn` removed (over budget = `data-over` on `.wl-uf08__budget` plus the words); why chips, Favorite and Main tags are non-interactive outline `.wl-chip`; Skipping line in the notice form; Reorder moved row = raise block (`data-moved`), `DragHandleIcon`; Add sheet = `.wl-sheet` (plan, grabber, `.wl-sheet-scrim`), search `.wl-input`, picks `.wl-row`; Looks good is the one `.wl-button--primary`, Shuffle, Add exercise and Reorder are `.wl-button--secondary`; Removed line rows/buttons in `.wl-row`/`.wl-button--text`. Empty live regions are visually hidden, not `display:none`. The legacy `.wl-uf08:not([data-wl-state])` base and all legacy 08.2/08.5 rules are deleted (grep: no other consumer in src or tests/e2e).
- AC map: AC1 cobalt-workout.test (roots, sheet attrs) + e2e AC1 (bg, theme-color, 28px radii, 0.45 scrim); AC2 e2e AC2 (+ vitest css, suggested-view data-over); AC3 e2e AC3 + cobalt-workout (data-moved) + uf-08-reorder.spec unchanged; AC4 e2e AC4 + existing add tests; AC5 e2e AC5 (pairs, raise never ink-muted, axe on screen/Reorder/sheet/results) + vitest one primary; AC6 e2e targets + motion; AC7 existing UF-08 vitest suite and the five specs unchanged, e2e AC7 none-left; AC8 canvas compare run (turn-3 plus app-only Reorder and sheet; no canvas frame for them).
- Test expectations changed (not weakened): cobalt-plan.test "old 16 px padding is gated" is now "no :not([data-wl-state]) rule" (the block was deleted); suggested-view and swap-before-start "items warn" now assert `data-over` and no `seg--warn` (D-0211 §5); e2e "UF-08.2 is unchanged: legacy chips" replaced by the T-0600 block. Granted visual-foundation/cobalt-controls/fonts specs did not use a UF-08 screen: untouched.
- Planted faults (backup copy, restored by cp), all red: no state on root, no `.wl-sheet`, no `.wl-input`, Shuffle as primary, warm-up segment ink, moved row transparent, caption ink-muted on raise, icon block-size 36px, sheet transition, `display:none` on empty status, budget text legacy warn colour. 9/13 new vitest and 8/8 new e2e went red together; the rest map one fault each by assertion.
- Page status line: now visually hidden when empty; uf-08-excluded.spec scopes its status locator to the removed line; e2e AC6 asserts the empty page status is in the a11y tree (planted display:none: red).
