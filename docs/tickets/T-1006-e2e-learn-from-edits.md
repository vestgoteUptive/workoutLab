---
id: T-1006
title: "e2e: learn from edits - three swaps then the prompt, yes and undo, removal prompt, Not today never counts, learning off, forget, offline, export and delete"
lane: qa
screens: [UF-08.2, UF-08.6, UF-09.9, UF-11.4, UF-11.5, UF-11.6]
decisions: [D-0277, D-0278]
deps: [T-1003, T-1004, T-1005]
status: todo
---
## Why
Counting, one question and the reuse of favorites and excluded exercises cross UF-08, UF-09 and UF-11 and the device store; only the built PWA proves it, including privacy (`docs/specs/learn-from-edits.md`).

## Scope
- In: `tests/e2e/uf-08-learn-from-edits.spec.ts`.
- Out: unit behaviour.

## Acceptance criteria
- AC1 (swap prompt) Given the same swap made in 3 visits (the last one in a workout via UF-09.9), When UF-08.2 opens, Then "Prefer … for Chest?" shows; after "Prefer it" the exercise is listed on UF-11.6 and leads the next plan's chest area; "Undo" removes it. Given 2 swaps, Then no card.
- AC2 (removal prompt) Given an exercise removed in 2 visits, Then "Stop suggesting …?" shows; yes lists it on UF-11.5.
- AC3 (never counted) Given 5 "Not today" taps and 5 equipment-taken swaps, Then no card ever shows.
- AC4 (asked once) Given "No thanks", Then no card for that pair after 3 more swaps.
- AC5 (learning off) Given the UF-11.4 toggle off, Then 3 swaps raise nothing; given on again, counting restarts from zero.
- AC6 (forget) Given a pending card, When "Forget what was counted" is used, Then the card is gone.
- AC7 (offline, both values) Given offline, Then the card shows with disabled buttons and the connect line; given online, the buttons work.
- AC8 (privacy) Given the app running, Then no network request carries ledger data (the Supabase guard asserts only the profile flag, favorite and excluded writes); the account export contains `learn_from_edits` and the accepted favorite; account deletion removes the device store.
- AC9 (focus mode) Given a workout, Then no prompt appears on any UF-09 screen.
- AC10 (a11y) Given axe on the card and the UF-11.4 section at 320 and 390 px, Then no violations.

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1006` and cite UF-08.2.

## Build / accept log
