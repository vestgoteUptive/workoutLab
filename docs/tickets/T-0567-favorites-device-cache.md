---
id: T-0567
title: "Favorites on the device: generalise excluded.ts/excluded-hooks.ts into one list-cache helper, Dexie v4 favorites table, refreshAll read, favorite/unfavorite writes, cross-list cache drop, useFavoriteIds/useFavoriteRows, sorted/deduped favoriteIds helper"
lane: web-shell
screens: [UF-02.1, UF-04.2, UF-08.2, UF-11.5, UF-11.6]
decisions: [D-0202, D-0199, D-0197, D-0195, D-0136, D-0071, D-0045]
deps: [T-0564]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §6, GitHub #46). Flow: wl-build-web (agent frontend-dev). About ½ day. Release is automatic (D-0201): the migration reaches prod on T-0564's merge push, and the read tolerates a missing table anyway (AC4). -->

## Why
D-0202 §6: every engine caller and both list screens need the stored favorites, offline too (NFR-OFF-3), without a cross-feature import (D-0071 §3 §9). T-0536 built exactly this for excluded exercises in `lib/offline/excluded.ts` and `excluded-hooks.ts`; D-0202 §6 asks to generalise that module rather than copy it.

## Scope
- In (`apps/web/src/lib/**`):
  - **One list-cache helper** (e.g. `lib/offline/exercise-list.ts`) parameterised by table name, Dexie table and write error type, holding the shared logic: refresh (authenticated rows replace, authenticated empty read empties, any read error including `PGRST205`/HTTP 404/network keeps the cache, offline skips the read, the cache-generation counter guards in-flight refreshes), the online-only upsert (`onConflict: "user_id,exercise_id"`, `ignoreDuplicates: true`; 0 rows back is success) and delete, cache-after-confirm, the warm-up refusal before any request, and the live-query hooks. `excluded.ts` and `excluded-hooks.ts` become thin users of it; **their public exports and behaviour stay identical** (every existing T-0536 test passes unchanged).
  - **Dexie version 4** in `lib/offline/db.ts`: adds `favoriteCache: "key, userId"` (row `{key, userId, exerciseId, createdAt}`, key via `userScopedKey`). No `.upgrade()` callback.
  - **Favorites API**, re-exported from `lib/offline/index.ts`: `refreshFavorites()` (called from `refreshAll()` and callable on UF-11.6 mount), `loadFavoriteIds(userId)`, `favoriteExercise(userId, id)`, `unfavoriteExercise(userId, id)`, `FavoriteWriteError`, `useFavoriteIds(userId)` (sorted ids), `useFavoriteRows(userId)` (rows with `createdAt`), and a pure `favoriteIdsFor(stored)` = `sorted(dedupe(stored))`.
  - **Cross-list drop (mirrors the T-0564 triggers):** after a confirmed `favoriteExercise` the id is removed from this user's excluded cache; after a confirmed `excludeExercise` it is removed from the favorites cache. Neither drop happens when the write fails.
  - Sign-out (D-0195 §3) and the account wipe (D-0136 §5) clear the new table through their every-table loops; tests prove it.
- Out: every screen and every `suggest` call (T-0568…T-0571, T-0577); an offline outbox (D-0202 default: writes online-only); any change to UF-04/UF-08/UF-11 feature code.

### Edge cases that are in scope
- **Offline:** cached favorites are read (AC2); writes reject with reason `offline` and no request.
- **Missing table / not yet released:** cache kept (AC4).
- **Returning after 10 days / other device:** `refreshAll` picks up another device's change (AC3).
- **Zero favorites:** an authenticated empty read empties the cache (AC5).
- **Sign-out mid-refresh:** nothing is written after the clear (AC8).
- **Favorite and excluded in both caches** (two-device race): callers treat exclusion as winning; this ticket only guarantees the drop after its own confirmed writes (AC7).

## Acceptance criteria
Unit tests with fake-indexeddb and a mocked Supabase client, user A.
- **AC1 (schema upgrade)** Given a v3 database holding A's queued sets in every terminal state (`status: "queued"`, `status: "rejected"`, a tombstoned `deletedAt` row), a queued session and an `excludedCache` row, When it opens at v4, Then every row is byte-equal to before and `favoriteCache` exists and is empty.
- **AC2 (offline read)** Given the cache holds [back-squat] for A and `navigator.onLine` is false, When `useFavoriteIds(A)` renders, Then it returns [back-squat] and no request is made. Given online with the same cache, Then it also returns [back-squat] (before any refresh resolves).
- **AC3 (refresh on start)** Given device 2's cache is empty and the server holds (A, back-squat), When `refreshAll` runs online, Then the cache holds [back-squat] before `refreshAll` resolves.
- **AC4 (missing-table tolerance)** Given the cache holds [back-squat], When the read fails with `{code: "PGRST205"}`, with HTTP 404, or with a network error, Then the cache is still [back-squat] (three cases).
- **AC5 (empty read replaces)** Given the cache holds [back-squat], When an authenticated read returns [], Then the cache is empty. Given signed out, Then no read and the cache unchanged.
- **AC6 (writes)** When `favoriteExercise(A, "back-squat")` resolves with 0 rows, Then success and the cache holds it once. When the upsert rejects, Then the promise rejects with `FavoriteWriteError` and the cache is unchanged. `unfavoriteExercise` resolves → gone; rejects → still there. `wu-cat-cow` (kind warmup) → rejects without a request.
- **AC7 (cross-list drop)** Given the excluded cache holds [back-squat], When `favoriteExercise(A, "back-squat")` is confirmed, Then the favorites cache holds back-squat and the excluded cache doesn't. When the upsert fails, Then the excluded cache still holds it. Given the favorites cache holds [bench-press], When `excludeExercise(A, "bench-press")` is confirmed, Then the favorites cache no longer holds it; on failure it still does.
- **AC8 (sign-out, wipe, in-flight)** Given the cache holds [back-squat] for A (and [lateral-raise] for B), When A signs out, Then no A rows remain and B's stay. The account wipe: the same. A refresh in flight when sign-out bumps the generation writes nothing when it resolves.
- **AC9 (sorted ids)** `favoriteIdsFor(["db-bench-press", "back-squat", "db-bench-press"])` is `["back-squat", "db-bench-press"]`; `favoriteIdsFor([])` is `[]`.
- **AC10 (no regression)** Every existing test under `lib/offline/__tests__/` for `excluded.ts`/`excluded-hooks.ts` passes unchanged (no edits to those test files except imports, if a file moved).

Checklist (D-0197 §7): online/offline (AC2, AC3); empty/non-empty reads (AC5); signed in/out (AC5, AC8); the v4 fixture carries every terminal set state (AC1).

## Paths you may change
- `apps/web/src/lib/**` (lane)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · contracts unchanged · commits start with `T-0567:` and cite UF-11.6 / UF-08.2.

## Build / accept log
