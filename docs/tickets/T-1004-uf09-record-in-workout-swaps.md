---
id: T-1004
title: UF-09 record in-workout swaps for learning (no new screen, control or text during a workout)
lane: web-feature:UF-09
screens: [UF-09.9]
decisions: [D-0277, D-0281, D-0243]
deps: [T-1007]
status: ready
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

- Release hold (T-1001 security review): no deploy that contains this ticket until T-1010 (privacy notice) is merged; list it in the PR to `main`.

## Paths you may change
`apps/web/src/features/UF-09/**`. Not parallel with another UF-09 ticket.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1004` and cite UF-09.9.

## Build / accept log
- Build (T-1004 UF-09): `record-swap.ts` + a 3-line hook in `seams.tsx` `SwapOverlay.onApply`. After `replaceItem` resolves, `recordSwap(from, to, reason, sessionId, now)` is fired and not awaited (errors swallowed). `from` is read from `ctx.plan` before the replace; the reason is read from the new item's `swap` reason (the UF-05 sheet's `onApply` does not pass it, UF-05 untouched). Counted/uncounted reasons, learning off and the per-visit dedupe are the ledger's (T-1007).
  AC map (`__tests__/t1004.record-swap.test.tsx`, 12 tests): AC1 reasons none/discomfort count (workout id as visit), equipment_taken/variety/short_on_time do not; AC2 A>B, B>A, A>B counts each pair once; AC3 learning on 1 row / off 0; AC4 online=true/false one row, `fetch` never called; AC5 body HTML after swap identical for learning on/off and counted/uncounted reason, live regions equal the paused baseline, existing UF-09 suite unchanged and green; AC6 cancel records nothing.
  Faults planted (copy-restored, cmp ok, none committed): no call (6 red), reason ignored (3 red), unique visit id (1 red), record on close (1 red).
  Gate: web typecheck, lint ok; web test 421 files / 5558 tests pass; format:check ok; e2e uf-09*+uf-05* 116 passed. check-all lists lane-path-not-owned for 4 files I did not touch (main moved past the branch base 86c43c85; stale base, not my diff).
  Release hold: no deploy containing T-1004 until T-1010 is merged; list in the PR to main.
