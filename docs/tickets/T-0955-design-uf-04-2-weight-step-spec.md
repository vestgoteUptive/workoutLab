---
id: T-0955
title: Design spec, the "Weight step" row on exercise detail and the "same weight again" reason copy
lane: design
screens: [UF-04.2, UF-09.3, UF-09.4]
decisions: [D-0251, D-0259, D-0211, D-0199, D-0202]
deps: []
status: done
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

## Build / accept log
- Base `77cdb857` (main-hzlbfc), clean. Added the "UF-04.2 Weight step (D-0251, D-0259)" section to `UF-04.1-UF-04.2.md` and the new `UF-09.3-UF-09.4.md` (no file covered the reason line). New test `packages/design-tokens/test/t0955-weight-step-spec.test.ts`. `tokens.json` untouched.
- Red run before the docs existed: the new test failed with "missing UF-09.3-UF-09.4.md" / "no heading ## UF-04.2 Weight step" (no tests ran). After the docs: 18 pass (one wording fix after a first red: "roving tabindex", "hidden (not disabled) for timed and bodyweight").
- AC1 `AC1` describe (radiogroup, four chips, roving tabindex, 44 px, `--wl-selected` + check mark). AC2 `AC2` it.each over every exact string. AC3 `AC3` (hidden not disabled, editable offline, queued write, D-0199/D-0202 carve-out, 8.6:1 contrast). AC4 `AC4` (exact hold_effort copy, no placeholders, no banner/modal/link). AC5 build tokens.css + main.css, every `--wl-*` the spec names already exists, no hex. AC6 every UF ID cited exists in user flows v2; `check:repo` passes.
- Gate: design-tokens typecheck, lint, test (17 files, 278 tests) green; `-w format:check` green after prettier; `-w check:repo` green; `-w test:repo-checks` green.
- Round 2 (review fixes): applied orchestrator rulings 1-5 in the spec text. UF-09.3 gets one static `hold_effort` line (all 9 PrefillKinds listed, 8 show none; `--wl-ink-muted` resolves to white in lift, 4.8:1 on lift bg, 6.1:1 on bg-deep). Offline store and queue cited as new work from T-0954. Radiogroup: arrows move and select, 600 ms debounce, Other opens without focus move. Other: blur-to-Cancel exempt, empty errors. Status templates, alert clears status, default 1 kg has no checked chip. Test now anchored to subsections (24 tests, was 18); screen IDs use word boundaries. design-tokens 18 files / 313 tests green, format:check green, check-all green. `tokens.json` untouched.
