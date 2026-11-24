---
id: T-1005
title: UF-11.4 "Learning from your edits" - the toggle, the device-only line and "Forget what was counted"
lane: web-feature:UF-11
screens: [UF-11.4]
decisions: [D-0277, D-0278, D-0195]
deps: [T-1000, T-1001, T-1002]
status: todo
---
## Why
Learning must be visible and reversible, and the user must be able to switch it off and clear it (`docs/specs/learn-from-edits.md`).

## Scope
- In (`apps/web/src/features/UF-11/`): the section in `AccountSettingsBody` per `UF-11.4.md`: a toggle "Suggest preferences from my swaps and removals" writing `profiles.learn_from_edits` alone (the `level` write pattern: `plan_changed_at` unchanged, a failed write reverts and says "Couldn't save. Try again."), the line "Counts are kept on this device only and are never sent anywhere. A preference is saved only when you say yes.", and "Forget what was counted" (`forget()`, status "Counts cleared."). Turning off also clears the ledger.
- Out: the ledger (T-1002), prompts (T-1003), UF-11.5 and UF-11.6 (unchanged).

## Acceptance criteria
- AC1 (on and off) Given the default, Then the toggle is on; Given it is turned off, Then `learn_from_edits` false is saved, the ledger is empty and no card shows on UF-08.2; Given turned on again, Then true.
- AC2 (offline, both values) Given offline, Then the toggle is `aria-disabled` with "Connect to change this" and nothing is written; "Forget what was counted" still works (device only). Given online, Then both work.
- AC3 (forget) Given a ledger with a pending prompt, When Forget is tapped, Then the ledger is empty, "Counts cleared." shows and the toggle is unchanged.
- AC4 (write fails) Given a rejected write, Then the toggle returns to its old state and the alert shows.
- AC5 (plan untouched) Given the toggle change, Then targets, the check-in streak and `plan_changed_at` are unchanged.
- AC6 (a11y) Given axe at 320 and 390 px, Then no violations, targets at least 44 px, the state in words and in the native checkbox.

## Paths you may change
`apps/web/src/features/UF-11/**`, `apps/web/src/lib/i18n/flows/uf-11.ts` (extra; orchestrator grant). Not parallel with another UF-11 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1005` and cite UF-11.4.

## Build / accept log
