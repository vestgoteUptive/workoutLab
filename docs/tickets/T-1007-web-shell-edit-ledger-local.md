---
id: T-1007
title: Web-shell - the on-device edit ledger (counts, window, thresholds, asked-marks, device id, dirty flags), the learning flag and reset epoch, cleared on sign-out and delete
lane: web-shell
screens: [UF-08.2, UF-11.4]
decisions: [D-0281, D-0277, D-0265, D-0195]
deps: [T-1001]
status: ready
---
## Why
Counting must be one shared, tested store that UF-08, UF-09 and UF-11 call (`docs/specs/learn-from-edits.md`). It counts on the device first, so it works offline and never waits for the network; the sync is T-1008 (D-0281 §2).

## Scope
- In (`apps/web/src/lib/offline/`, `apps/web/src/lib/account/`, profile cache): an IndexedDB store (version bump, as the weight-step store) holding a random `deviceId` (made on first use, in the same store) and entries `{key, kind, exerciseId, toExerciseId, count, windowStart, lastSeen, askedAt, dirty, visits}`. API: `recordSwap(from, to, reason, visitId, now)`, `recordRemoval(exerciseId, visitId, now)`, `markAsked(key, now)`, `entries()`, `pending(remoteRows, now)` (the pure total of D-0281 §2: own entries plus the rows of other devices), `clearLocal()`, `useLearnFlag()` reading `profiles.learn_from_edits` and `learn_reset_at` through the profile cache (missing flag means true, missing epoch null). Rules: reasons none or discomfort only; one signal per key per visit; threshold 3 swap and 2 removal on the summed total; the window starts at the first signal and a signal after 60 days restarts the entry at 1; an entry whose window is over stops counting; 200-entry cap; entries whose swap-in is already a favorite or whose exercise is already excluded raise nothing; entries with `lastSeen` at or before `learn_reset_at` are dropped. Learning off: nothing is written and the store is cleared. Cleared by sign-out (unsynced counts are dropped, no confirm) and account deletion with the other stores.
- Out: any network call (T-1008), any UI, the favorites and excluded writes (T-1003), engine.

## Acceptance criteria
- AC1 (swap threshold, both values) Given 2 swap signals for (A, B) in 2 visits, Then `pending([])` is empty; Given a third, Then it holds (A, B). Given 3 signals within one visit, Then the count is 1.
- AC2 (reasons) Given reasons none and discomfort, Then counted; Given equipment_taken, variety and short_on_time, Then not counted.
- AC3 (removal) Given 1 removal, Then not pending; Given a second in another visit, Then pending. Given "Not today", a stepper remove and a dropped exercise: not counted (the API has no such method, asserted).
- AC4 (window and cap, both values) Given signals on day 0, 30 and 59, Then the count is 3; Given a next signal on day 61, Then the entry restarts at 1 with `windowStart` day 61. Given an entry whose window ended 61 days ago and no new signal, Then it contributes 0. Given the 201st entry, Then the oldest is dropped.
- AC5 (sum across devices) Given own count 1 for (A, B) and remote rows of two other devices with counts 1 and 1 inside their windows, Then the total is 3 and `pending` holds it; Given one of those rows' window older than 60 days, Then the total is 2.
- AC6 (asked for good) Given `markAsked`, Then the entry is not pending and a later signal never makes it pending; Given a remote row with `askedAt`, Then the key is not pending either.
- AC7 (already decided) Given the swap-in already a favorite, or the removed exercise already excluded, Then nothing becomes pending.
- AC8 (learning on/off) Given the flag false, Then `recordSwap` and `recordRemoval` write nothing and the store is empty; Given true, they count. Given a missing profile value, Then true.
- AC9 (reset epoch) Given `learn_reset_at` later than an entry's `lastSeen`, Then the entry is dropped and never dirty; Given an entry after it, Then kept.
- AC10 (clearing) Given sign-out or account deletion, Then the store is empty (including dirty entries); Given another user's entries on the device, Then only this user's go.
- AC11 (offline and online) Given `navigator.onLine` false, Then counting and `pending` work; given online, the same; no network call is made by any function of this ticket.
- AC12 (persistence and device id) Given a reload, Then counts, dirty flags, asked-marks and the `deviceId` survive; given `clearLocal()`, Then a new `deviceId` is made at the next signal; given an IndexedDB upgrade from the previous version, Then existing stores are intact (fixture with a tombstoned queue entry and a rejected set).

## Paths you may change
`apps/web/src/lib/**` (offline, account, profile). Not parallel with another web-shell ticket that edits `lib/offline`.

## Contract impact
none (the schema is T-1001).

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1007`.

## Build / accept log
