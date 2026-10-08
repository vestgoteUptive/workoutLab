---
id: T-0536
title: "Excluded exercises on the device: Dexie v3 table keyed by userId, read on start and in refreshAll, exclude/include writes (cache after server confirm), missing-table tolerance, sorted/deduped union helper, online state"
lane: web-shell
screens: [UF-02.1, UF-04.2, UF-05.1, UF-08.2, UF-11.5]
decisions: [D-0199, D-0200, D-0195, D-0136, D-0197, D-0071, D-0045]
deps: [T-0535]
status: todo
---
<!-- Written by product-owner 2026-10-07 (groom, D-0199 item d). Flow: wl-build-web (agent frontend-dev). About ½ day. MERGE ONLY AFTER H-27 (D-0199 §11, D-0200 §2): refreshAll reads excluded_exercises from prod as soon as main deploys. -->

## Why
D-0199 §5 §6: every engine caller (UF-02, UF-05, UF-08) and every list screen (UF-04, UF-11) needs the stored list, offline too (NFR-OFF-3), without a cross-feature import (D-0071 §3 §9). So the cache, its refresh and the two writes live in `lib/`.

## Scope
- In (`apps/web/src/lib/**`):
  - **Dexie schema version 3** in `lib/offline/db.ts`: a new table for the cached list (e.g. `excludedCache: "key, userId"`, key `${userId}:${exerciseId}`, row `{key, userId, exerciseId, createdAt}`). Version 3 only adds a store: no `.upgrade()` callback, so no queued row can change (NFR-OFF-2).
  - **Read:** an `excluded` module in `lib/` (e.g. `lib/offline/excluded.ts`, re-exported from `lib/offline/index.ts`) with `refreshExcluded(userId)`, called from `refreshAll()` and callable on UF-11.5 mount. An authenticated read with rows replaces this user's cached rows; an authenticated empty read empties them (D-0197 §2). **A read error, including PostgREST `PGRST205` or HTTP 404, keeps the cache as it is** and is never treated as an empty read. Offline: no read, the cache stays.
  - **Respect the cache-generation counter** like every other refresh (T-0530, T-0531): a refresh that resolves after sign-out or account deletion writes nothing.
  - **Writes:** `excludeExercise(userId, exerciseId)` = `upsert({exercise_id}, {onConflict: "user_id,exercise_id", ignoreDuplicates: true})`; zero rows back is success. `includeExercise(userId, exerciseId)` = delete; deleting a missing row is success. The cache changes **only after the server confirms**. A failure (network, RLS, missing table) rejects with a typed error and leaves the cache unchanged. A warm-up id (`kind` warmup in the cached library) is refused in the client before any request.
  - **Reads for callers:** `useExcludedIds(userId)` (a live query; sorted ids) and `useExcludedRows(userId)` (rows with `createdAt`, for UF-11.5).
  - **Union helper:** `excludeIdsFor(stored, visit)` = `sorted(dedupe(stored ∪ visit))`. Pure, in `lib/`.
  - **Online state:** one shared `useOnline()` hook in `lib/` (the same `online`/`offline` event logic the features copy today) so the feature tickets use one source. Existing feature copies are not touched here.
  - Sign-out (D-0195 §3) and the account wipe (D-0136 §5) clear the new table through their generic every-table loops; tests prove it.
- Out:
  - `lib/account/export.ts` (moved to T-0535 by D-0200 §1).
  - Every screen and every `suggest`/`rankSwaps` call (T-0538…T-0542).
  - An offline outbox (D-0199 default: writes are online-only).
  - Shared UI components and copy (T-0537).

### Edge cases that are in scope
- **Offline:** the cached list is read, so callers honour it offline (AC2); writes are not attempted offline (callers disable them; the helper rejects if called anyway).
- **Missing table (prod not released):** the cache is kept (AC4).
- **Returning after 10 days / other device:** the next `refreshAll` on start picks up another device's change (AC3).
- **Zero exclusions:** an authenticated empty read empties the cache (AC5).
- **Sign-out mid-refresh:** the refresh writes nothing after the clear (AC8).
- **Time running out:** not applicable.

## Acceptance criteria
Unit tests with fake-indexeddb and a mocked Supabase client, user A.
- **AC1 (schema upgrade)** Given a v2 database holding A's queued sets in every terminal state (`status: "queued"`, `status: "rejected"`, a tombstoned `deletedAt` row) and a queued session, When it opens at v3, Then every row is byte-equal to before and `excludedCache` exists and is empty.
- **AC2 (offline read)** Given the cache holds [bench-press] for A and `navigator.onLine` is false, When `useExcludedIds(A)` renders, Then it returns [bench-press] and no request is made.
- **AC3 (refresh on start, AC18)** Given device 2's cache is empty and the server holds (A, bench-press), When `refreshAll` runs online, Then the cache holds [bench-press] before `refreshAll` resolves.
- **AC4 (missing-table tolerance, AC19)** Given the cache holds [bench-press], When the read fails with `{code: "PGRST205"}`, or with HTTP 404, or with a network error, Then the cache is still [bench-press] (three cases).
- **AC5 (empty read replaces)** Given the cache holds [bench-press], When an authenticated read returns [], Then the cache is empty. Given the user is signed out, Then no read is made and the cache is unchanged.
- **AC6 (writes)** Given online, When `excludeExercise(A, "bench-press")` resolves with 0 rows (duplicate), Then it succeeds and the cache holds bench-press once. When the upsert rejects, Then the promise rejects and the cache is unchanged. When `includeExercise(A, "bench-press")` resolves, Then the cache no longer holds it; when the delete rejects, Then the cache still does. Given `wu-cat-cow` (kind warmup), Then `excludeExercise` rejects without a request.
- **AC7 (union)** `excludeIdsFor(["lateral-raise", "bench-press"], ["inverted-row", "bench-press"])` is `["bench-press", "inverted-row", "lateral-raise"]`; `excludeIdsFor([], [])` is `[]`.
- **AC8 (sign-out, wipe, in-flight)** Given the cache holds [bench-press] for A, When A signs out, Then the table has no A rows (and B's rows, if any, stay). When the account wipe runs, Then the same. Given a refresh in flight when sign-out bumps the generation, When it resolves, Then it writes nothing.
- **AC9 (online hook)** `useOnline()` is false when `navigator.onLine` is false at mount and becomes true on the `online` event without a remount; and the reverse.

Checklist (D-0197 §7): online/offline (AC2, AC3, AC9), empty/non-empty reads (AC5), signed in/out (AC5, AC8) each have both values. The v3 upgrade fixture carries every terminal set state (AC1).

## Paths you may change
- `apps/web/src/lib/**` (lane)

## Contract impact
None.

## Release order
**Merge only after H-27 is ticked** (D-0199 §11, D-0200 §2).

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · contracts unchanged · commits start with `T-0536:` and cite the screen IDs.

## Build / accept log
Archived in `docs/tickets/log/T-0536.md` (D-0157).
