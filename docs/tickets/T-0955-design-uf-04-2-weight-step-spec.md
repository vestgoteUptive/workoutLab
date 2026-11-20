---
id: T-0955
title: Design spec, the "Weight step" row on exercise detail and the "same weight again" reason copy
lane: design
screens: [UF-04.2, UF-09.3, UF-09.4]
decisions: [D-0251, D-0259, D-0211, D-0199, D-0202]
deps: []
status: ready
---
## Why
The web tickets T-0956 (control) and T-0953 (reason copy) need a written screen spec first. The spec fixes the radiogroup, the "Other" field, the messages and the offline behaviour, so the build has no open choices (D-0259 §7-§13).

## Scope
- In:
  - `Design-docs/docs/design/screens/UF-04.1-UF-04.2.md`: a "Weight step" row below Favorite / "Don't suggest this". `role="radiogroup"` labelled "Weight step", chips 1.25 / 2.5 / 5 / Other, roving tabindex, each >= 44 px, selected = `--wl-selected` plus a check mark. The chip equal to the library default is a reset; a text button "Use default ({n} kg)" only while an override exists. Visible "Weight step: 1.25 kg (yours)" / "(default)". Helper "How much the weight goes up each time." One `role="status"` line present on mount ("Weight step set to 1.25 kg." / "Weight step back to the default, 2.5 kg."), `role="alert"` "Couldn't save. Try again." with revert, no undo. "Other": `inputmode="decimal"`, label "Step in kg", Save, Cancel and Escape restore, validate on Save and blur (`aria-invalid`, `aria-describedby`), error "Enter a step from 0.25 to 10 kg, in multiples of 0.25.", off-list value shows "Other: 1.5 kg". Hidden (not disabled) for timed and bodyweight exercises. Editable offline (queued write carve-out from D-0199/D-0202; no "Connect to change..." copy). Numbers through `Intl`. Contrast line for the selected chip.
  - Short notes for UF-09.3 / UF-09.4: the weight stepper steps by the exercise's step, and the reason line. Create `Design-docs/docs/design/screens/UF-09.3-UF-09.4.md` if no file covers them. A reason-line table including `hold_effort`: "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up." (no placeholders; the only change in focus mode is this text, no banner, modal or link).
  - A design-tokens docs test (extend `packages/design-tokens/test/docs.test.ts` or a new file) that checks the spec names the radiogroup, 44 px, the status and alert roles and the exact copy strings.
  - No new token.
- Out: any code in `apps/`; `tokens.json` (unchanged).

## Acceptance criteria
- AC1 Given the UF-04.2 spec, When the docs test reads it, Then it names `role="radiogroup"`, the four chips, the 44 px minimum, and states selection is by `--wl-selected` plus a check mark.
- AC2 Given the spec, When read, Then it contains the exact strings: "Use default ({n} kg)", "Weight step set to 1.25 kg.", "Weight step back to the default, 2.5 kg.", "Couldn't save. Try again.", "Enter a step from 0.25 to 10 kg, in multiples of 0.25.", "How much the weight goes up each time."
- AC3 Given the spec, When read, Then it states the row is hidden for timed and bodyweight exercises, and editable offline, with the reason (queued write).
- AC4 Given the UF-09 note, When read, Then it contains the exact `hold_effort` copy and says it has no placeholders and no other focus-mode change.
- AC5 Given `tokens.json`, When the token tests run, Then they pass unchanged and no new `--wl-*` variable appears (the check lives in the existing token tests).
- AC6 Given the spec, When read, Then every screen ID cited exists in user flows v2 (`check-all.mjs` passes).

## Paths you may change
- `Design-docs/docs/design/screens/UF-04.1-UF-04.2.md`
- `Design-docs/docs/design/screens/UF-09.3-UF-09.4.md` (new, if no file covers the reason line)
- `packages/design-tokens/test/**` (docs test only)

## Contract impact
none (`tokens.json` unchanged; D-0251 §3).

## Definition of done
Tests for every AC pass · `pnpm --filter @workoutlab/design-tokens test` green · contracts unchanged · commit messages start with `T-0955` and cite UF-04.2.

Per-package commands: `pnpm --filter @workoutlab/design-tokens typecheck`, then a separate `… lint`, then a separate `… test`.
