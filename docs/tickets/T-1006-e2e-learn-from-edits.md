---
id: T-1006
title: "e2e: learn from edits - three swaps then the prompt, yes and undo, removal prompt, Not today never counts, learning off, forget, offline, export and delete"
lane: qa
screens: [UF-08.2, UF-08.6, UF-09.9, UF-11.4, UF-11.5, UF-11.6]
decisions: [D-0277, D-0281, D-0280]
deps: [T-1002, T-1003, T-1004, T-1005, T-1010]
status: done
---
## Why
Counting, one question and the reuse of favorites and excluded exercises cross UF-08, UF-09 and UF-11, the device store and the account's `edit_signals` table; only the built PWA proves it, including two devices, export and delete (`docs/specs/learn-from-edits.md`).

## Scope
- In: `tests/e2e/uf-08-learn-from-edits.spec.ts`.
- Out: unit behaviour.

## Acceptance criteria
- AC1 (swap prompt) Given the same swap made in 3 visits (the last one in a workout via UF-09.9), When UF-08.2 opens, Then "Prefer … for Chest?" shows; after "Prefer it" the exercise is listed on UF-11.6 and leads the next plan's chest area; "Undo" removes it. Given 2 swaps, Then no card.
- AC2 (removal prompt) Given an exercise removed in 2 visits, Then "Stop suggesting …?" shows; yes lists it on UF-11.5.
- AC3 (never counted) Given 5 "Not today" taps and 5 equipment-taken swaps, Then no card ever shows.
- AC4 (asked once) Given "No thanks", Then no card for that pair after 3 more swaps.
- AC5 (learning off) Given the UF-11.4 toggle off, Then 3 swaps raise nothing; given on again, counting restarts from zero.
- AC6 (forget) Given a pending card, When "Forget what was counted" is used, Then the card is gone and the backend holds no `edit_signals` row for the user.
- AC6b (two devices) Given two browser contexts with the same account against the mock backend, When context 1 makes 2 swaps of a pair and context 2 makes 1 (each synced), Then UF-08.2 on context 2 shows "Prefer … for …?"; after "No thanks" on context 2, context 1 shows no card for the pair after its next sync. Given one context offline for its swaps, Then its counts arrive after it reconnects and nothing is counted twice (the total stays 3 after a forced second flush).
- AC7 (offline, both values) Given offline, Then the card shows with disabled buttons and the connect line; given online, the buttons work.
- AC8 (privacy, export, delete) Given the app running, Then the only requests carrying counts are upserts and deletes on `edit_signals` with the user's own `device_id` (the Supabase guard allows that table plus the profile flag, favorite and excluded writes, and no request body names an exercise outside the row columns); the account export has 11 tables with the user's `edit_signals` rows, `learn_from_edits` and the accepted favorite; account deletion leaves no `edit_signals` row and no device store; sign-out clears the device store.
- AC9 (focus mode) Given a workout, Then no prompt appears on any UF-09 screen.
- AC10 (a11y) Given axe on the card and the UF-11.4 section at 320 and 390 px, Then no violations.

- From T-1008: e2e "opted out on device A, device B saves the profile, learning stays off" (T-1008 covers it with a unit scan only).

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1006` and cite UF-08.2.

## Build / accept log

- Build (qa, 2026-11-24): `tests/e2e/uf-08-learn-from-edits.spec.ts` (16 tests) and `tests/e2e/fixtures/learn-from-edits.ts` (a stateful fake of `edit_signals` with the unique key and the stale-write rule, the profile flag and epoch, favorites, excluded, account delete; shared by all pages of a test, so two contexts are two devices on one account; records every Supabase request). Signals are made through the real UI (UF-08.6 swap/Remove/Not today, UF-09.9 swap); tests that only need a pending card seed another device's rows into the fake, which arrive through the real pull. App code untouched, no app bug found.
- AC to test: AC1 "AC1 three swaps..." (visits 1-2 on UF-08.6, visit 3 in a workout via UF-09.9, no card at 2, card, Prefer it, UF-11.6, next plan leads with it) and "AC1 Undo"; AC2 "AC2 Remove in two visits"; AC3 "AC3 five Not today..." (5 visits, ledger empty, no upsert, then a counted control swap = 1); AC4 "AC4 No thanks" (3 more swaps, total 6, no card); AC5 "AC5 learning off" (toggle via UF-11.4, 3 swaps nothing, on, 2 swaps nothing, 3rd card); AC6 "AC6 Forget" (card from 2 local + 1 remote, Forget, rows gone, nothing comes back); AC6b "two devices" and "one device offline" (goOffline gate, total 3 after reconnect and after a forced second flush); AC7 "AC7 offline" (both kinds, force-click does nothing, online works); AC8 "the export" (11 tables, edit_signals rows, learn_from_edits, favorite), "account deletion" (device store 0, rows gone), "sign-out" (device store 0), and `assertPrivacy` (writes only on the four tables, edit_signals columns, own user and device id, no name in a body) run inside AC2, AC5, AC6b, AC8; AC9 "AC9 no prompt on any UF-09 screen" (09.3, 09.9, 05.1 sheet, threshold crossed in the workout); AC10 "AC10 axe..." at 320 and 390 (card both kinds, after yes, 44 px, no h-scroll; UF-11.4 section axe is `uf-11-learning.spec.ts` T-1005 AC6); T-1008 "opted out on device A".
- Limits: the cascade on account delete is simulated by the fake (the real FK cascade is T-1001's pgTAP); AC8 "no device store" reads IndexedDB `editLedger`, `editLedgerMeta`, `editSignalsCache`.
- Runs: spec + `fixture-guard.spec.ts` with `--repeat-each 2`: 254 passed. Planted faults in the test (restored from a backup copy, cmp clean), each red: AC1 two swaps only; AC1 Undo not tapped; AC2 one removal; AC3 reason Best match; AC4 No thanks skipped; AC5 toggle skipped; AC6 Forget skipped; AC6b B swap skipped; AC6b no reconnect; AC7 never offline; AC8 yes skipped, delete skipped, sign-out skipped, privacy allow-list without profiles; AC9 prompt expected; AC10 target 200 (2 red); T-1008 A not opted out. Two first-run test bugs fixed (aria-disabled needs force click; seeded counters). Gate: format:check, lint (incl. tests/e2e), check-all green.
