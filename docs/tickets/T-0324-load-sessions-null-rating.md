---
id: T-0324
title: "loadSessions merge: an explicit effort_rating null clears the cached rating, endedAt is the later of cache and queue (D-0148); unblocks UF-03.3 Save"
lane: web-shell
screens: [UF-03.3]
decisions: [D-0148, D-0058, D-0053, D-0045, D-0067]
deps: [T-0319]
status: ready
---
<!-- Groomed 2026-10-02 by product-owner. From the T-0319 review (board row T-0324). Build flow: wl-build-web. About ¼ day. It blocks T-0420 (UF-03.3 effort and Save), which sends `effort_rating: null` when no chip is picked. T-0319 is done, so this is ready now. It is parallel-safe with every UF-03, UF-05 and UF-09 ticket: it touches only `lib/offline/feature-loaders.ts` and its tests. -->

## Why
- **UF-03.3** lets the user rate a workout or leave it unrated (D-0030). T-0420 saves the whole stored row through the queue, with `effort_rating: null` when no chip is checked. NULL is a real server state (D-0058 §1, `docs/data-model.md` `sessions.effort_rating` nullable).
- `loadSessions` coalesces with `row.effort_rating ?? previous?.effortRating ?? null` (`feature-loaders.ts:87`). It can't represent an explicit null, so a cleared rating shows the stale cached one again.
- `endedAt` is coalesced the same way (`:85`), so an earlier queued `ended_at` hides a later cached one. D-0053 §7 says the latest `endedAt` wins.
- D-0148 fixes the merge rule. This ticket implements it.

## Scope
- In:
  - `loadSessions` in `apps/web/src/lib/offline/feature-loaders.ts`: the merge of a cached row and a queued row for the same id follows D-0148 §1–§5.
  - Tests in `apps/web/src/lib/offline/__tests__/sessions-cache.test.ts` (extend) or a new `sessions-merge.test.ts` in the same folder.
  - The doc comment on `loadSessions` names D-0148.
- Out:
  - `upsertSession`, `flushSessions` and the `finished` marker (their D-0053 §7 guard stays as is).
  - `refreshSessions` and the cache shape.
  - Any UF-03 UI (T-0420).
  - `POST /sessions/{id}/finish` and `supabase/**`.

### Edge cases that are in scope
- **Offline:** every case is IndexedDB only; the loader makes no network call (the T-0319 AC-5 test stays green).
- **Zero history:** a queued-only session with no cached row is unchanged (D-0148 §5, AC-5).
- **Returning after 10 days off:** the cache was refreshed after another device finished the same session later. The later cached finish wins (AC-2).
- **Time zones:** `+02:00` and `Z` offsets compare as instants (AC-3).

## Acceptance criteria
**Test setup.** The existing `sessions-cache.test.ts` setup: `fake-indexeddb`, the `select-spy` supabase mock, `signIn(USER_A)`, `refreshSessions(NOW, TZ)` to fill the cache from the spy rows, and `upsertSession` or `offlineDb().sessions.put` for the queue. S1 has `started_at` `2026-09-17T09:00:00.000Z` and `time_budget_min` 45.

**Test rules.** Both values of every binary condition get a test. Each AC marked "red on main" must fail against main's `loadSessions`, and the build log records the run. The build log also records these planted faults turning their ACs red, each applied alone and reverted:
- the `?? previous?.effortRating` fallback restored for a present key (AC-1);
- `endedAt` back to `row.ended_at ?? previous?.endedAt` (AC-2);
- `endedAt` compared as strings instead of `Date.parse` (AC-3);
- `effortRating` always from the queued row, ignoring a strictly later cached finish (AC-2, second bullet).

- **AC-1 (explicit null clears; red on main, D-0148 §3)**
  - Given the cached S1 with `ended_at` `2026-09-17T10:05:00.000Z` and `effort_rating` 5, When `upsertSession({id: "S1", started_at, ended_at: "2026-09-17T10:05:00.000Z", time_budget_min: 45, energy: "normal", effort_rating: null})` runs, Then `loadSessions()` returns S1 with `effortRating: null` and `endedAt` `2026-09-17T10:05:00.000Z`. Main returns 5.
  - **The pair (a value).** The same with `effort_rating: 2` returns `effortRating: 2`.
  - **The pair (absent key).** The same with the `effort_rating` key left out returns `effortRating: 5`. The existing "keeps the cached energy when a queued edit omits it" test, which asserts 5, passes unedited.
- **AC-2 (a later cached finish wins whole; red on main, D-0148 §1 §2)**
  - Given the cached S1 with `ended_at` `2026-09-17T10:40:00.000Z` and `effort_rating: null` (another device finished later), and a queued S1 (`finished: true`, `pending: false`) with `ended_at` `2026-09-17T10:31:00.000Z` and `effort_rating` 4, Then `loadSessions()` returns S1 with `endedAt` `2026-09-17T10:40:00.000Z` and `effortRating: null`. Main returns `10:31` and 4.
  - **The pair (the queue is later).** With the queued `ended_at` `2026-09-17T10:50:00.000Z` and `effort_rating` 4, it returns `10:50` and 4.
  - **Equal instants (red on main).** With both `ended_at` `2026-09-17T10:40:00.000Z`, the cached `effort_rating` 3 and the queued `effort_rating: null`, it returns `10:40` and `effortRating: null`. Main returns 3. The pair: the queued `effort_rating` 1 returns 1.
  - **Never unfinished.** The existing "never lets a queued metadata edit un-finish a cached session" test (queued `ended_at: null`, cached `10:05` and 5) passes unedited and returns `10:05` and 5.
- **AC-3 (instants, not strings; red on main, D-0148 §1)** Given the cached S1 `ended_at` `2026-09-17T10:40:00+00:00` with `effort_rating` 2, and a queued S1 `ended_at` `2026-09-17T12:31:00+02:00` (10:31 UTC) with `effort_rating` 4, Then `loadSessions()` returns `endedAt` `2026-09-17T10:40:00+00:00` and `effortRating` 2. A string compare picks the queued value. The pair: a queued `2026-09-17T12:50:00+02:00` (10:50 UTC) returns that string and 4.
- **AC-4 (unparsable, D-0148 §1)** Given the cached S1 `ended_at` `2026-09-17T10:40:00.000Z` and a queued S1 `ended_at` `"not-a-date"` with `effort_rating` 4 (put directly with `as never`), Then `loadSessions()` returns `endedAt` `"not-a-date"` and 4, and doesn't throw. The pair: the queued `ended_at` is a valid later instant and returns it.
- **AC-5 (unchanged behaviour, D-0148 §4 §5)**
  - A queued-only S9 with no cached row and `effort_rating: null` returns `effortRating: null` and `energy: "normal"` (the existing "falls back to normal" test passes unedited).
  - `energy` keeps the cached `"high"` when the queued row leaves it out (the existing test passes unedited).
  - Every existing test in `sessions-cache.test.ts` and `offline-loaders.test.ts` passes with no edit to its assertions (the build log lists the run).
  - The sort (`startedAt`, then `id`) and the per-user split are unchanged.

## Paths you may change
- `apps/web/src/lib/offline/**` (the lane: `web-shell`), limited in practice to `feature-loaders.ts` and its tests.
- **Listed extras:**
  - `docs/tickets/T-0324-load-sessions-null-rating.md`: this file, for the build and accept logs.
- Read-only: `.squad/decisions/D-0148-load-sessions-merge-rule.md`, `docs/data-model.md`.

## Contract impact
None. `sessions.effort_rating` is already nullable, and the queued upsert shape is unchanged (D-0148 consequences).

## Definition of done
Tests for every AC pass, with the red-on-main runs and the planted faults recorded · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0324` and cite the screen (for example `T-0324 UF-03.3: explicit null rating clears the cache (D-0148)`).

## Notes
- **Flow:** `wl-build-web`.
- **Unblocks:** T-0420 (UF-03.3 effort and Save). T-0420's AC-2 "no pick sends `effort_rating: null`" relies on AC-1 here for any later reader of `loadSessions` (UF-06, UF-11).
- **Parallel:** safe with T-0428, T-0416 and every UF-05 and UF-09 ticket.

## Build log
- **2026-10-02, frontend-dev (build).** `loadSessions` in `apps/web/src/lib/offline/feature-loaders.ts` now merges per D-0148: a new `cachedFinishIsLater(cachedEnd, queuedEnd)` helper (true when the cached `endedAt` is non-null and the queued one is null, or both `Date.parse` and the cached instant is strictly later; an equal instant or an unparsable side keeps the queue). When it is true the cached finish wins whole (`endedAt` and `effortRating`, §2). Otherwise `endedAt` is the queued value and `effortRating` is `row.effort_rating ?? null` when `Object.hasOwn(row, "effort_rating")`, else the cached value (§3). `energy` keeps its coalesce (§4); a queued-only row is unchanged (§5). The doc comment names D-0148.
- **Tests.** New `apps/web/src/lib/offline/__tests__/sessions-merge.test.ts` (16 tests), on the `sessions-cache.test.ts` harness:
  - AC-1: explicit null clears the cached 5; the pairs (a value 2; an absent key keeps 5).
  - AC-2: cached 10:40/null beats queued 10:31/4; the pair (queued 10:50/4 wins); equal instants with queued null clears 3, and its pair (queued 1); a queued `ended_at: null` with a present rating 2 keeps the cached 10:05/5.
  - AC-3: `10:40:00+00:00`/2 beats `12:31:00+02:00`/4; the pair (`12:50:00+02:00`/4 wins).
  - AC-4: queued `"not-a-date"`/4 wins without throwing; the pair (a valid later instant wins).
  - AC-5: queued-only S9 with explicit null (whole row) and with a rating; cached energy `high` kept when omitted and a present `low` wins; sort by `startedAt` then `id` over merged rows.
  - `sessions-cache.test.ts` and `offline-loaders.test.ts` are unedited and green (37/37 with the new file).
- **Red on main** (main's `feature-loaders.ts` swapped in, `sessions-merge` + `sessions-cache` run): 6 red, all in `sessions-merge.test.ts` — AC-1 "explicit null clears" (got 5), AC-2 "cached 10:40 / null beats 10:31 / 4" (got 10:31/4), AC-2 "equal instants: queued null clears 3" (got 3), AC-2 "queued ended_at null with a present rating" (got 2), AC-3 "10:40+00:00 beats 12:31+02:00" (got the queued string), AC-5 "sorts merged rows" (the cached later finish). Every `sessions-cache.test.ts` case stayed green.
- **Planted faults** (each applied alone to the new code, run, reverted):
  - F1 `?? previous?.effortRating` restored for a present key → 2 red: AC-1 "explicit null clears", AC-2 "equal instants: queued null clears 3".
  - F2 `endedAt: row.ended_at ?? previous?.endedAt ?? null` → 3 red: AC-2 "cached 10:40 / null beats 10:31 / 4", AC-3 "10:40+00:00 beats 12:31+02:00", AC-5 sort.
  - F3 string compare (`cachedEnd > queuedEnd`) → 1 red: AC-3 "10:40+00:00 beats 12:31+02:00".
  - F4 `effortRating` always from the queue (cached-wins branch ignored) → 4 red: AC-2 "cached 10:40 / null beats 10:31 / 4", AC-2 "queued ended_at null with a present rating", AC-3 "10:40+00:00 beats 12:31+02:00", AC-5 sort.
- **Runs (under the test lock).** `pnpm --filter @workoutlab/web typecheck` / `lint` green; `pnpm --filter @workoutlab/web test` 161 files, 2525 tests passed; `test:e2e offline.spec.ts` 1 passed; `pnpm -w format:check` clean; `node .github/scripts/check-all.mjs` clean.
