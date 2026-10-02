---
id: T-0319
title: Offline caches v2 — one Dexie version bump for exercise details + variants, sessions (56 d), plan_checkins and routines, with read-only loaders
lane: web-shell
screens: [UF-04.1, UF-04.2, UF-04.3, UF-06.1, UF-06.2, UF-07.1, UF-11.1, UF-11.2]
decisions: [D-0001, D-0021, D-0034, D-0045, D-0067, D-0070, D-0071]
deps: [T-0300c]
status: done
---
<!-- Written by triage 2026-09-29 (TR-0030) from D-0067 §3 (in force) and D-0071. Build flow: wl-build-web. About ½ day. Web-shell: runs after T-0318 and before T-0301a, never in parallel with another web-shell ticket. -->

## Why
NFR-OFF-1 says the exercise library is cached, and UF-04 needs the exercise text and variants for that. UF-06 and UF-11 need session rows (`checkinSessions` needs `{id, startedAt}`), UF-11 needs `plan_checkins`, and UF-07/UF-11.2 need routines. The T-0300c Dexie v1 cache holds only engine-shaped rows (library, history, targets, profile). One version bump in `lib/offline` adds all four caches at once, so no feature ticket touches IndexedDB (D-0067 §3, §5).

## Scope
- In (all in `apps/web/src/lib/offline/`):
  - **Dexie version 2** in `db.ts` with four new per-user tables. Every v1 table and every v1 row is kept, with no data migration: v1 rows stay as they are, and the new tables start empty.

    | Table | Key | Content |
    |---|---|---|
    | `exerciseDetails` | `${userId}:${id}` | `{id, instructions, mistakes, cue, source, license, attribution, sourceUrl, variants}` |
    | `sessionCache` | `${userId}:${id}` | the `sessions` row fields below |
    | `checkinCache` | `${userId}:${id}` | a `PlanCheckin` (`toPlanCheckin`) |
    | `routineCache` | `${userId}:${id}` | `{id, name, updatedAt, items: [{position, exerciseId}]}` |

  - **Refreshes:**
    - `refreshLibrary` fills `exerciseDetails` from the `exercises` rows it already selects (`select("*")`, no second request for the text), plus one `exercise_variants` select. `variants` = the `variant_id`s for that `exercise_id`, sorted by id. It writes both tables in one transaction.
    - New `refreshSessions(now, tz)`: `sessions` rows with `started_at ≥ windowStartInstant(now, tz, 56)`, the same window as history (D-0034 §3).
    - New `refreshCheckins()`: every `plan_checkins` row of the user.
    - New `refreshRoutines()`: `routines` + `routine_items`.
    - Each refresh **replaces** that user's rows in its table (a delete of the user's rows plus `bulkPut`, in one transaction), like v1.
  - `refreshAll(now, tz)` also runs `refreshSessions`, `refreshCheckins` and `refreshRoutines`. The post-flush refetch (AC-C17 in `sync.ts`) also runs `refreshSessions` and `refreshCheckins`.
  - **Loaders** (read-only, exported from `lib/offline/index.ts`; offline they read the cache with no network call awaited):
    - `loadExerciseDetail(id): Promise<ExerciseDetail | null>` returns `null` for an unknown id.
    - `loadVariants(id): Promise<string[]>` returns the variant ids sorted by id, or `[]`.
    - `loadSessions(): Promise<{id, startedAt, endedAt, timeBudgetMin, effortRating, energy}[]>` returns the cached server rows ∪ this user's queued `sessions` rows (every `QueuedSession`, pending or not), with **the queued row winning by `id`**. The result is sorted by `startedAt`, then `id`.
    - `loadCheckins(): Promise<PlanCheckin[]>`, sorted by `proposedAt` desc, then `id`.
    - `loadRoutines(): Promise<{id, name, updatedAt, items: {position, exerciseId}[]}[]>`, with the items sorted by `position` and the routines by `name` (`localeCompare`), then `id`.
- Out:
  - Write helpers for plans, check-ins or routines. Those are online-only supabase-js calls made by the features (D-0070 §2–§3).
  - Changes to the queue (`recordSet`, `upsertSession`, flush order).
  - UI.
  - Any contract change.

### Edge cases that are in scope
- **Offline:** every loader resolves from IndexedDB with `fetch` rejecting and `navigator.onLine = false` (AC-5). A refresh that fails leaves the previous cache intact, because the transaction isn't entered (AC-6).
- **Upgrade:** a device holding a v1 database with queued sets and sessions opens v2 without losing any row (AC-1). No queued data is lost on upgrade (NFR-OFF-2).
- **Two users on one device:** rows are isolated by `userId` like v1 (AC-7, the T-0300c AC-C12 pattern).
- **Zero history:** every loader returns `[]`/`null` on a fresh database.
- **Returning after 10 days off:** a session started 10 days ago is inside the 56-day window and cached. One from 57 local days ago isn't (AC-3).
- **Time running out:** not applicable.

## Acceptance criteria
Vitest + `fake-indexeddb` in `apps/web/src/lib/offline/__tests__/`, with Supabase spied by the existing `supabase-spy.ts` helpers. Clock: tz Europe/Stockholm, now `2026-09-27T12:00:00+02:00`.

- **AC-1 (v1 → v2 upgrade)** Given a `wl-offline` database created by the v1 schema holding 2 queued sets, 1 queued session (`finished: true`), and history/library/target/profile rows, When the v2 `OfflineDb` opens it, Then every v1 row is still readable and deep-equal, and `exerciseDetails`, `sessionCache`, `checkinCache` and `routineCache` exist and are empty. `db.verno` is 2.
- **AC-2 (details + variants)** With `exercises` rows for back-squat (`instructions: ["a","b"]`, `mistakes: []`, `cue: "c"`, `source: "workoutlab"`, `license: "LicenseRef-workoutLab"`, `attribution: null`, `source_url: null`) and `exercise_variants` [(back-squat, leg-press), (back-squat, goblet-squat)], after `refreshLibrary()`: `loadExerciseDetail("back-squat")` deep-equals `{id: "back-squat", instructions: ["a","b"], mistakes: [], cue: "c", source: "workoutlab", license: "LicenseRef-workoutLab", attribution: null, sourceUrl: null, variants: ["goblet-squat","leg-press"]}`. `loadVariants("back-squat")` = `["goblet-squat","leg-press"]`. `loadExerciseDetail("nope")` = `null`, and `loadVariants("nope")` = `[]`. The `exercises` table is selected once per refresh (spy count 1).
- **AC-3 (sessions window + queue wins)** Server rows S1 (`started_at` 2026-09-17), S2 (2026-08-03 00:30 local, the first day of the 56-day window: today − 55) and S3 (2026-08-02 23:30 local, excluded): `refreshSessions` requests `started_at ≥ windowStartInstant(now, tz, 56)` (spy on the filter value), and `loadSessions()` returns S1 and S2 only. A queued S1 with `ended_at` set and `effort_rating` 4 wins over the server S1. A queued-only S4 (never flushed) is included. The result is sorted by `startedAt`, then `id`, with the fields `{id, startedAt, endedAt, timeBudgetMin, effortRating, energy}`.
- **AC-4 (check-ins + routines)** After `refreshCheckins()`, `loadCheckins()` returns every row mapped by `toPlanCheckin` (deep-equal), newest `proposedAt` first. After `refreshRoutines()` with routine R {name "Lower A"} and items at positions 2, 0, 1, `loadRoutines()` returns R with its items sorted by position `[{position: 0, …}, {position: 1, …}, {position: 2, …}]`. Routines sort by name.
- **AC-5 (offline loaders)** After one online `refreshAll()`, with `fetch` rejecting and `navigator.onLine = false`, each of the 5 new loaders resolves the same values as online, and no Supabase call is awaited (spy count unchanged).
- **AC-6 (refresh replaces, failure keeps)** A second `refreshRoutines()` whose server data no longer contains R removes R from `loadRoutines()`. A refresh whose select rejects throws and leaves the previous rows unchanged (the same for sessions and check-ins).
- **AC-7 (per user)** User A's cached sessions, check-ins, routines and details are not returned while user B is current, and B's refresh doesn't delete A's rows.
- **AC-8 (refreshAll + post-flush refetch)** `refreshAll()` calls the three new refreshes once each (spies). A flush that sent ≥ 1 row calls `refreshSessions` and `refreshCheckins` once (AC-C17 extended). A flush that sent nothing calls neither. The existing T-0300c tests pass unchanged.
- **AC-9 (no write helpers)** `lib/offline/index.ts` exports the 5 loaders and 3 refreshes added here, plus the v1 exports unchanged (a test on the export keys). There's no export that writes `routines`, `routine_items`, `plan_checkins`, `profiles` or `area_targets`.

## Paths you may change
- `apps/web/src/lib/offline/**` (web-shell).

## Contract impact
None. The selects read `exercises`, `exercise_variants`, `sessions`, `plan_checkins`, `routines` and `routine_items` exactly as in `docs/data-model.md`, under the existing RLS. `PlanCheckin` is the existing `@workoutlab/shared` mapper. When T-0223 lands (`period_index ≥ 0`, nullable `completed_prev`), `toPlanCheckin` changes in the data lane, and this cache needs no change.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0319:` and cite the screens served (for example `T-0319 UF-04.2: cache exercise details and variants`).

## Build / accept log
Archived in `docs/tickets/log/T-0319.md` (D-0157).
