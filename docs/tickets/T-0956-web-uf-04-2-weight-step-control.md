---
id: T-0956
title: Web, the "Weight step" control on exercise detail
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0251, D-0259, D-0017]
deps: [T-0954, T-0955]
status: todo
---
## Why
Users set their own step (1.25, 2.5, 5 kg or their own value) per exercise on UF-04.2 only, never in a workout (principle 1). The store and effective library come from T-0954; the layout and copy from T-0955.

## Scope
- In: the "Weight step" row in the UF-04.2 feature folder as specified in `Design-docs/docs/design/screens/UF-04.1-UF-04.2.md`: radiogroup chips, "Other" field, "Use default ({n} kg)" button, status and alert lines, hidden for timed and bodyweight (shared external-load predicate), offline editable, i18n copy in the UF-04 file, numbers through `Intl`.
- Out: store, queue, engine feed (T-0954); UF-09; kg only (no lb, D-0017).

## Acceptance criteria
- AC1 Given a loaded non-timed exercise with library step 2.5 and no override, When UF-04.2 opens, Then the row shows "Weight step: 2.5 kg (default)", the 2.5 chip is selected, and no "Use default" button is shown.
- AC2 Given that screen, When the user chooses "1.25 kg", Then the override is saved, the row shows "Weight step: 1.25 kg (yours)", the status line says "Weight step set to 1.25 kg.", and "Use default (2.5 kg)" appears.
- AC3 Given an override, When the user presses "Use default (2.5 kg)" (or the 2.5 chip), Then the override is removed and the status says "Weight step back to the default, 2.5 kg."
- AC4 Given "Other", When the user enters 0.1, 10.25, 0 or "abc" and saves, Then "Enter a step from 0.25 to 10 kg, in multiples of 0.25." shows with `aria-invalid="true"` and `aria-describedby`, and nothing is saved. Given 1,5 or 1.5, Then it is accepted and the row shows "Other: 1.5 kg"; given 10, Then accepted.
- AC5 Given "Other" is open, When the user presses Cancel or Escape, Then the previous value is restored with focus returned to the chip.
- AC6 Given a timed exercise (plank) or a bodyweight exercise (push-up), When UF-04.2 opens, Then the row is not in the DOM.
- AC7 Given the device offline, When the user picks 1.25 kg, Then it applies at once, the status line confirms, no "Connect to change..." text is shown and the write is queued. Sibling (online): the same flow saves directly.
- AC8 Given a save that fails, When the write rejects, Then `role="alert"` shows "Couldn't save. Try again." and the row reverts to the previous value.
- AC9 Given the radiogroup, When the user presses ArrowRight/ArrowLeft, Then focus and selection move by roving tabindex; Tab leaves the group.
- AC10 Given the row, When axe runs on UF-04.2, Then there are no violations; each chip and the field are at least 44 px; selection is conveyed by a check mark and words, not colour alone.
- AC11 Given the `role="status"` element, When the page mounts, Then it already exists in the DOM (empty) so the later message is announced.

## Paths you may change
- `apps/web/src/features/UF-04/**`
- Extras, named explicitly: UF-04 i18n copy file if it sits under `apps/web/src/lib/i18n/**`.

## Contract impact
none (D-0251 table from T-0951).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0956` and cite UF-04.2.

Per-package commands: `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.
