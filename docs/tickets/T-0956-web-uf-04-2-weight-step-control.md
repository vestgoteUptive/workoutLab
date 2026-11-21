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
- `tests/e2e/uf-04-weight-step.spec.ts` (extra: the e2e moves from apps/web/src/features/UF-04/__e2e__ into tests/e2e; orchestrator grant)
- `apps/web/src/features/UF-04/**`
- Extras, named explicitly: UF-04 i18n copy file if it sits under `apps/web/src/lib/i18n/**`.

## Contract impact
none (D-0251 table from T-0951).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0956` and cite UF-04.2.

Per-package commands: `pnpm --filter @workoutlab/web typecheck`, then a separate `… lint`, then a separate `… test`.

## Build / accept log
- Built `WeightStep.tsx` + `weight-step.css` (UF-04 folder), mounted in `LibraryDetail` after the action row; copy in `lib/i18n/flows/uf-04.ts`. The default comes from `loadBaseLibrary()`, the hidden rule from `hasExternalLoad` (shared). Writes via `setExerciseStep`/`resetExerciseStep`; rejections via `useExerciseSettingErrors`.
- AC to test (`__tests__/weight-step.test.tsx`, 27 tests): AC1 default state (3), AC2/AC3 set and reset (2), AC4 Other (5 invalid + 1,5 + 1.5 + 10 + blur/Cancel skip), AC5 Cancel/Escape (2), AC6 plank and push-up (2), AC7 offline queued and online direct (2), AC8 failed save (1), AC9 arrows, debounce, Home/End, Other (2), AC10 axe, check mark, 44 px CSS (3), AC11 status on mount (1). E2E happy path + hidden row: `__e2e__/uf-04-weight-step.spec.ts` (run once as a temp copy in tests/e2e, 2 passed, then removed; QA wires it in).
- Planted faults (backup copies, restored by `cp`, each failed exactly the named test): effective instead of base default (AC1 base test); predicate dropped (plank); debounce 0 (AC9); blur-to-Cancel skip removed (AC4); status not on mount (AC11); check mark removed (AC10); default chip not a reset (AC2/AC3, 2 tests); alert dropped (AC8); comma not accepted (AC4 "1,5").
- Red runs on first version: tests failed on duplicate `role=status` (DetailActions has one, so tests scope to the row) and on NBSP in names (`formatKg`); fixed in the tests, not the code.
- Gate: `turbo typecheck lint test --filter=@workoutlab/web --force` 388 files / 5146 tests green; `format:check` green. `check:repo` lists only supabase paths that `main` changed after my base (96dce8d3); none are in my diff.
