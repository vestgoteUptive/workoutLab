---
id: T-0610
title: "UF-07.1 Edit routine in the plan state: item rows with drag handle and remove icon, the selected row in plan.raise, inputs with an ink-muted boundary, errors in plan.attention, the danger button as the secondary outline placed last, Save routine as the one white primary"
lane: web-feature:UF-07
screens: [UF-07.1]
decisions: [D-0208, D-0210, D-0211, D-0213]
deps: [T-0593, T-0591]
status: todo
---
<!-- Groomed 2026-10-09 (D-0213). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Plan · edit routine" (#turn-3). Behaviour: T-0308a. The canvas progression-rule section is rejected (D-0212 §4). -->
## Why
UF-07.1 uses `warn` for three things: invalid inputs, error text and the danger button. D-0211 §5 maps each one.

## Scope
- **In:**
  - `EditorForm.tsx` and `routine-editor.css`.
  - The root has `data-wl-state="plan"` and `.wl-page`.
  - The header's Cancel and Save are text buttons.
  - The name is a `.wl-input`.
  - Items are `.wl-row`, with the existing reorder control as an `aria-hidden` handle icon and the remove control as an `aria-hidden` cross, both in 44 px buttons with their existing names. The selected or editing row is `--wl-raise` with `--wl-ink` text.
  - "+ Add exercise" is a text button.
  - `input[aria-invalid]` gets a 2 px `--wl-attention` border, and `__error[data-tone="error"]` text is `--wl-attention`.
  - `button[data-variant="danger"]` becomes `.wl-button--secondary`, last in its section.
  - "Save routine" is the one white primary.
- **Out:**
  - Copy and routine logic.

## Acceptance criteria
- **AC1 (state).** The editor root has `data-wl-state="plan"` and a `plan.bg` `theme-color`.
- **AC2 (errors).** An invalid set count shows a 2px `plan.attention` border and the existing error text in `plan.attention` (≥ 5.0 on `plan.bg`). A valid value shows the 1px `plan.ink-muted` border. Both are tested.
- **AC3 (danger).** The delete control isn't `.wl-button--primary`, has the 1.5px `plan.ink` outline, and is the last focusable control in its section. Its name and confirm are unchanged.
- **AC4 (selected row).** The editing row is `plan.raise` with `plan.ink` text (6.2). No text on it uses `ink-muted`.
- **AC5 (contrast, targets, type, motion, guard).**
  - Axe colour-contrast has 0 violations, including the error state.
  - Handles, removes and inputs are ≥ 44 × 44.
  - No px font size and no raw colour.
  - Only the cross-fade animates, and it's instant under reduced motion. Both values are tested.
- **AC6 (behaviour unchanged).** `uf-07-routines.spec.ts` and the UF-07 vitest suite pass with no role or name change. A new routine (empty) and an existing one each render.
- **AC7 (visual compare).** `compareWithCanvas` saves "Plan · edit routine" (turn-3), plus an app-only error-state shot. The log lists the verdicts. Expected deviation: no progression-rule section.

Checklist (D-0197 §7):
- Valid and invalid, new and existing routines, and row selected and not are all covered.
- No migration fixture: not applicable.

## Paths you may change
- `tests/e2e/visual-foundation.spec.ts` (orchestrator grant, for every screen restyle: move this screen's checks from the legacy no-state scale to the plan or state scale, as T-0601/T-0597 did, or to an injected no-state fixture; never use another real screen as the no-state host)
- `apps/web/src/features/UF-07/**` (lane)
- `tests/e2e/uf-07-routines.spec.ts` (listed extra)
- `docs/tickets/T-0610-uf07-routine-editor-cobalt.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-07-routines.spec.ts` green · commit messages start with `T-0610` and cite UF-07.1.

## Build / accept log
- Built: EditorForm/index/routine-editor.css to the plan state (`.wl-page`, `.wl-input`, `.wl-row`, text/secondary/primary buttons). AC→test: AC1 t0610.cobalt + e2e; AC2 t0610.cobalt, t0610.css, e2e (1px/2px border, axe contrast on the error state); AC3 cobalt + e2e (outline colour, last control); AC4 t0610.css (`:focus-within` = raise + ink) + e2e computed bg; AC5 t0610.css (44px, no px font/raw colour/display:none, cross-fade + reduced motion) + e2e axe, 44x44, reduced-motion; AC6 existing 126 UF-07 vitest + uf-07-routines e2e unchanged; AC7 canvas turn-3 + error shot saved.
- Planted faults (backup restored with cp): Delete as primary, root without data-wl-state, `:focus-within` renamed: 4 new tests went red. Gate, repo-checks, format, check-all exit 0; full e2e 593 passed.
- Verdicts: matches canvas except the progression-rule section (D-0212 §4), the canvas header (Cancel/Save are in the form's actions: Save stays "Save", copy out of scope), drag-handle dots (up/down buttons kept as arrows), name as a boxed input.
