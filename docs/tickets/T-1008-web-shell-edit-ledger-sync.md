---
id: T-1008
title: Web-shell - sync the edit ledger through the account (serial absolute upserts of this device's rows, pull and sum, asked marks, lapsed-row cleanup, Forget and learning-off deletes)
lane: web-shell
screens: [UF-08.2, UF-11.4]
decisions: [D-0281, D-0001, D-0015, D-0195]
deps: [T-1001, T-1007]
status: ready
---
## Why
The counts must reach the user's other devices without ever counting a signal twice (D-0281 §2). Each device writes only its own rows as absolute states; the total is the sum. Plain CRUD under RLS, no Edge Function (D-0001).

## Scope
- In (`apps/web/src/lib/offline/`, `apps/web/src/lib/account/`): `flushLedger()` (one flush at a time; per dirty entry one `upsert` with `onConflict: 'user_id,device_id,key'` of `count`, `window_start`, `last_seen`, `asked_at`, then clean; a failure leaves it dirty and retries; triggers: app start, the `online` event, a debounce after a signal, UF-08.2 mount); `pullLedger()` (online, one select of the user's `edit_signals` rows, cached on the device for offline reads, feeding `pending(remoteRows)`); cleanup (delete lapsed rows without `asked_at`, and this device's rows beyond the 200 cap); `forgetAll()` (delete all of the user's rows, then touch `learn_reset_at`) and `turnLearningOff()` (delete rows, then write `learn_from_edits = false`; a failed step reports an error and changes nothing else); a fresh profile read with the flag false or a newer `learn_reset_at` clears the device ledger and the cache before any flush. The flush sends only the table's columns (no exercise names, no free text).
- Out: any UI and copy (T-1003, T-1005), the schema (T-1001), the local rules (T-1007), the export (T-1002).

## Acceptance criteria
Two simulated devices (two `deviceId`s) against an in-memory fake of the table that enforces the unique key and the stale-write rule.
- AC1 (sum across devices) Given device A with 2 signals for (X, Y) and device B with 1, After both flush and B pulls, Then B's total is 3 and the key is pending; given A's flush replayed 5 times, Then the total is still 3.
- AC2 (order and replay) Given a flush that the server applied but whose response was lost, When it is retried, Then the row is unchanged; Given a late write with an older `last_seen`, Then the row is unchanged; given one flush in flight, Then a second does not start until it ends.
- AC3 (offline, both values) Given offline, Then signals stay dirty, nothing is sent, `pending` uses the cached rows; Given the `online` event, Then the dirty entries are sent without a reload. Given online, the same signals reach the fake.
- AC4 (asked syncs) Given A answers "No thanks", When B pulls, Then the key is not pending on B; given B had its own count of 2 for it, Then still not pending.
- AC5 (reset epoch and flag) Given `forgetAll()` online, Then the fake holds no rows for the user, `learn_reset_at` changed, and a device that was offline with older dirty entries drops them at its next profile read and sends nothing. Given `turnLearningOff()`, Then the same plus the flag false and the local ledger empty. Given either is offline, Then nothing changes and the call reports "offline".
- AC6 (failure) Given the row delete of Forget failing, Then `learn_reset_at` is not touched and the error is reported; Given the flag write failing after the deletes, Then the flag is unchanged and the error is reported.
- AC7 (cleanup, both values) Given a row with a window older than 60 days and no `asked_at`, Then a pull deletes it; with `asked_at`, Then it is kept and not counted.
- AC8 (privacy) Given any flush, Then the request body holds only `edit_signals` columns, no other table is written, and `record*` itself makes no request; given sign-out, Then unsynced entries are dropped and nothing is sent.
- AC9 (not in focus mode) Given a workout on UF-09, Then no flush or pull starts a visible element or blocks a set write (the flush runs in the background like AutoSync).

Checklist (D-0197 §7): online/offline, replay/first send, own row/other device's row, flag on/off.

- Note (T-1001 security review): writes that touch `learn_from_edits` or `learn_reset_at` send only the changed fields, never a full cached profile upsert. e2e: opted out on device A, device B saves the profile, learning stays off.

- From the T-1007 review: add `ackSynced(key, lastSeenSent)` that clears `dirty` only if the entry's `lastSeen` is unchanged, so a signal counted during an in-flight push is not marked clean. Comment on `ledgerKey` that it is the `edit_signals.key`, not a user-scoped cache key.

## Paths you may change
`apps/web/src/lib/**` (offline, account, profile). Not parallel with another web-shell ticket that edits `lib/offline`.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-1008`.

## Build / accept log
- Build (web-shell, 2026-11-24): `edit-ledger-sync.ts` (flushLedger single-flight, pullLedger + cleanup, forgetAll, turnLearningOff, startLedgerSync wired in AutoSync), `ackSynced` (lastSeen/count/askedAt unchanged), `applyProfileLearning` in refreshProfile, Dexie v8 `editSignalsCache`, `ledgerKey` comment. AC->test: all in `offline/__tests__/edit-ledger-sync.test.tsx` (34 tests, two devices vs fake `edit-signals-fake.ts`): AC1 sum/replay x5, AC2 lost response/older last_seen/single-flight/ackSynced, AC3 offline+online event+debounce+backoff, AC4 asked, AC5 forget/learning-off/offline device/offline call, AC6 both failing steps, AC7 lapsed with/without asked_at + cap 200, AC8 columns only/sign-out/user switch, AC9 hung push does not block recordSet. Faults planted and restored with cp/cmp: ackSynced ignores lastSeen (3 red), Forget ignores failed delete (1), cleanup deletes asked rows (1), offline check removed (1), turnLearningOff writes extra field (1), count+1 in payload (10), reset purge disabled (1 red after test strengthened), single-flight removed (red only after test waited a real 40 ms; first version was green = test fixed). Gate: turbo typecheck lint test green, format:check green; check-all/repo-checks red only for lane-path-not-owned on files from earlier commits (branch is 23 commits ahead of origin/main), none in my paths. Not done: e2e (not required by ACs), no UI to turn learning back on (follow-up).

