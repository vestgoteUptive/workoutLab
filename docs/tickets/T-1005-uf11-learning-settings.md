---
id: T-1005
title: UF-11.4 "Learning from your edits" - the toggle, the account line and "Forget what was counted" (synced counts)
lane: web-feature:UF-11
screens: [UF-11.4]
decisions: [D-0277, D-0281, D-0195]
deps: [T-1000, T-1001, T-1008]
status: ready
---
## Why
Learning must be visible and reversible, and the user must be able to switch it off and clear it (`docs/specs/learn-from-edits.md`).

## Scope
- In (`apps/web/src/features/UF-11/`): the section in `AccountSettingsBody` per `UF-11.4.md`: a toggle "Suggest preferences from my swaps and removals" writing `profiles.learn_from_edits` alone (the `level` write pattern: `plan_changed_at` unchanged, a failed write reverts and says "Couldn't save. Try again."), the line "Counts are saved with your account, only you can see them, and they are included when you export your data. A preference is saved only when you say yes.", and "Forget what was counted" (`forgetAll()` of T-1008: the account's counts on every device are deleted, status "Counts cleared."). Turning off calls `turnLearningOff()` (rows deleted, flag written, local ledger cleared).
- Out: the ledger and its sync (T-1007, T-1008), prompts (T-1003), UF-11.5 and UF-11.6 (unchanged).

## Acceptance criteria
- AC1 (on and off) Given the default, Then the toggle is on; Given it is turned off, Then `learn_from_edits` false is saved, the account's rows are deleted, the ledger is empty and no card shows on UF-08.2; Given turned on again, Then true.
- AC2 (offline, both values) Given offline, Then the toggle and "Forget what was counted" are both `aria-disabled` with "Connect to change this" and nothing is written or deleted. Given online, Then both work.
- AC3 (forget) Given a ledger with a pending prompt and rows on the account from another device, When Forget is tapped, Then the local ledger and every `edit_signals` row of the user are gone, `learn_reset_at` changed, "Counts cleared." shows and the toggle is unchanged. Given the row delete fails, Then "Couldn't save. Try again." and nothing else changes.
- AC4 (write fails) Given a rejected write, Then the toggle returns to its old state and the alert shows.
- AC5 (plan untouched) Given the toggle change, Then targets, the check-in streak and `plan_changed_at` are unchanged.
- AC6 (a11y) Given axe at 320 and 390 px, Then no violations, targets at least 44 px, the state in words and in the native checkbox.

- Note (T-1001 security review): writes that touch `learn_from_edits` or `learn_reset_at` send only the changed fields, never a full cached profile upsert. e2e: opted out on device A, device B saves the profile, learning stays off.

- From T-1008: the UI to turn learning back on needs a changed-field-only write of `learn_from_edits = true` (T-1008 ships only `turnLearningOff()` and `forgetAll()` in `lib/offline/edit-ledger-sync.ts`).

## Paths you may change
`apps/web/src/features/UF-11/**`, `apps/web/src/lib/i18n/flows/uf-11.ts` (extra; orchestrator grant). Not parallel with another UF-11 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1005` and cite UF-11.4.

## Build / accept log

- Build (T-1005, frontend-dev): `LearningSection` (UF-11.4 5b) between Your data and Delete; `turnLearningOn()` is feature-local (`learning-writes.ts`, one `learn_from_edits = true` update then `refreshProfile`) because `lib/offline/edit-ledger-sync.ts` is outside the ticket paths. AC1-AC6 in `__tests__/learning-section.test.tsx` (11 tests, both values of each condition); e2e in `__e2e__/learning.spec.ts` (4 passed from a temp copy in tests/e2e, removed; axe + 44 px at 320/390). Faults planted and restored by cp/cmp: forget offline guards removed (red only after also dropping the `run` guard: the first fault was equivalent), no revert on failure, full-profile write on turn-on, on path calling turnLearningOff, forget calling turnLearningOff. Existing equipment tests were scoped to the equipment card (a new status and checkbox now exist). Open: T-1008's guard test "no source file writes learn_* except the sync module" fails on `learning-writes.ts`; fix is to move `turnLearningOn` into the sync module (lib grant) and delete `learning-writes.ts`.
