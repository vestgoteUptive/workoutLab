---
id: T-1000
title: Screen specs for learn from edits - the preference prompt card on UF-08.2 and the Learning section on UF-11.4
lane: design
screens: [UF-08.2, UF-11.4, UF-11.5, UF-11.6]
decisions: [D-0277, D-0281, D-0276, D-0211]
deps: [T-0993]
status: done
---
## Why
The prompt card and the Learning section need a spec before the web builds them (`docs/specs/learn-from-edits.md`). Runs after T-0993 because both edit `UF-08.2.md`.

## Scope
- In (`Design-docs/docs/design/screens/`): `UF-08.2.md` gains the prompt card (neutral notice pattern, two buttons, `role="status"` present on mount, the swap and removal copy, the after-yes status line with Undo, offline reasons, focus); `UF-11.4.md` gains the "Learning from your edits" section (toggle, the account line, "Forget what was counted", offline state, status lines); one line each in `UF-11.5.md` and `UF-11.6.md` ("a learned preference is an ordinary row").
- Out: tokens (none), code.

## Acceptance criteria
- AC1 Given `UF-08.2.md`, Then the card's states are specified: swap pending, removal pending, two pending (oldest first), after yes, after no, offline (buttons `aria-disabled` with the existing "Connect to change …" lines), learning off (no card).
- AC2 Given the card, Then it uses only `--wl-*` variables, has targets at least 44 px, contrast ratios written, no timeout, never over another control, and is absent from UF-08.1 and UF-09.
- AC3 Given `UF-11.4.md`, Then the section specifies the toggle (default on), the sentence "Counts are saved with your account, only you can see them, and they are included when you export your data. A preference is saved only when you say yes.", "Forget what was counted" (it deletes the account's counts on every device), both online and offline states (the toggle and Forget are both `aria-disabled` with "Connect to change this" offline), and the status lines ("Counts cleared.", "Couldn't save. Try again.").
- AC4 Given the focus rules, Then after a card answer focus goes to the status line's Undo, and after Forget it stays on the button.
- AC5 `check-all` and the design-docs tests pass.

## Paths you may change
`Design-docs/docs/design/**`, `packages/design-tokens/test/**` (docs test only)

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1000` and cite UF-08.2 and UF-11.4.

## Build / accept log
- Build (design): UF-08.2.md gained "Learning prompt card" (states, copy, focus, contrast); UF-11.4.md gained section 5b "Learning from your edits" (order line, states, a11y); one line each in UF-11.5.md and UF-11.6.md. Test `packages/design-tokens/test/t1000-learning-specs.test.ts`: AC1 card states, AC2 card rules, AC3 Learning section, AC4 focus (one describe each; AC5 = check-all + design-tokens test). Planted faults (backup + cp + cmp): focus-to-Undo text removed, "on every device" changed, "Absent from UF-08.1 and UF-09" changed: each failed 1 test, restored, green. First run red on my own wrong string (role="status" quoting), fixed. Open: after "No thanks" there is no Undo (AC4 names Undo only for yes); focus goes to the next card or the first row.
