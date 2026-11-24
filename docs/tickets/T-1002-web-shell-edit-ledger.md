---
id: T-1002
title: Web-shell - the device-only edit ledger (counts, thresholds, asked-marks), the learning flag, cleared on sign-out, delete and Forget
lane: web-shell
screens: [UF-08.2, UF-11.4]
decisions: [D-0277, D-0278, D-0265, D-0195]
deps: [T-1001]
status: todo
---
## Why
Counting must be one shared, tested store that UF-08, UF-09 and UF-11 call (`docs/specs/learn-from-edits.md`). It stays on the device (D-0278).

## Scope
- In (`apps/web/src/lib/offline/`, `apps/web/src/lib/account/`, profile cache): an IndexedDB store (new version bump, as the weight-step store) with `recordSwap(from, to, reason, visitId, now)`, `recordRemoval(exerciseId, visitId, now)`, `pending()`, `markAsked(key)`, `forget()`, `useLearnFlag()` reading `profiles.learn_from_edits` through the existing profile cache (missing means true). Rules of D-0277: reasons none or discomfort only; one signal per key per visit; threshold 3 swap and 2 removal; 60-day window; 200-entry cap; entries already favorite or excluded raise nothing. Learning off: nothing is written and the store is cleared. Cleared by sign-out and account deletion with the other stores.
- Out: any UI, the favorites and excluded writes (T-1003), engine.

## Acceptance criteria
- AC1 (swap threshold, both values) Given 2 swap signals for (A, B) in 2 visits, Then `pending()` is empty; Given a third, Then it holds (A, B). Given 3 signals within one visit, Then the count is 1.
- AC2 (reasons) Given reasons none and discomfort, Then counted; Given equipment_taken, variety and short_on_time, Then not counted.
- AC3 (removal) Given 1 removal, Then not pending; Given a second in another visit, Then pending. Given "Not today", a stepper remove, a dropped exercise: not counted (they never call the store; the API has no such method, asserted).
- AC4 (window and cap) Given a signal 61 days old, Then dropped; Given the 201st entry, Then the oldest is dropped.
- AC5 (asked for good) Given `markAsked`, Then the entry is not pending and a later signal for the same key never makes it pending.
- AC6 (already decided) Given the swap-in already a favorite, or the removed exercise already excluded, Then nothing becomes pending.
- AC7 (learning on/off) Given the flag false, Then `recordSwap` and `recordRemoval` write nothing and the store is empty; Given true, Then they count. Given a missing profile value, Then true.
- AC8 (clearing) Given sign-out, account deletion or `forget()`, Then the store is empty; Given another user's data on the device, Then only this user's entries go (as the existing wipe).
- AC9 (offline and online) Given `navigator.onLine` false, Then counting and `pending()` work; given online, the same; no network call is made by any store function.
- AC10 (persistence) Given a reload, Then counts and asked-marks survive; given an IndexedDB upgrade from the previous version, Then existing stores are intact (fixture with a tombstoned queue entry and a rejected set).

## Paths you may change
`apps/web/src/lib/**` (offline, account, profile). Not parallel with another web-shell ticket that edits `lib/offline`.

## Contract impact
none (no openapi or data-model change; the column is T-1001).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1002`.

## Build / accept log
