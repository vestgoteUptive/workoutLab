---
id: T-1004
title: UF-09 record in-workout swaps for learning (no new screen, control or text during a workout)
lane: web-feature:UF-09
screens: [UF-09.9]
decisions: [D-0277, D-0281, D-0243]
deps: [T-1007]
status: todo
---
## Why
A swap made on the floor (UF-09.9 → UF-05.1) is the strongest signal, but the question must never interrupt a workout (principle 1). It only needs counting on the device (T-1007); the background sync is T-1008 and the card appears on the next UF-08.2 (T-1003).

## Scope
- In (`apps/web/src/features/UF-09/`): after a confirmed swap from UF-09.9, call `recordSwap(from, to, reason, workoutId, now)`; nothing else changes.
- Out: any UI, UF-05.1 itself, UF-08.

## Acceptance criteria
- AC1 Given a confirmed swap with reason none or discomfort, Then one signal is recorded with the workout id; Given reason equipment_taken, variety or short_on_time, Then none.
- AC2 Given two swaps of the same pair in one workout, Then one signal.
- AC3 Given learning off, Then nothing is recorded; given on, one signal.
- AC4 Given offline and online, Then the same (no network call from the recording).
- AC5 Given the paused screen and focus mode before and after a swap, Then the DOM has no new element, text or live region (snapshot of the screen is unchanged apart from the swap itself) and the existing UF-09 tests pass unchanged.
- AC6 Given a cancelled swap sheet, Then no signal.

## Paths you may change
`apps/web/src/features/UF-09/**`. Not parallel with another UF-09 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1004` and cite UF-09.9.

## Build / accept log
