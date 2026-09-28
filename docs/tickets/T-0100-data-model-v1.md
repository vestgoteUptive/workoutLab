---
id: T-0100
title: Data model v1 (gap B3) — tables, keys, indexes, RLS, set-sync upsert, plan_checkins, onboarding fields; first migrations; pgTAP
lane: data
screens: [UF-01.4, UF-01.5, UF-04.3, UF-07.1, UF-08.1, UF-08.3, UF-09.4, UF-09.7, UF-11.1, UF-11.2, UF-11.3]
decisions: [D-0001, D-0011, D-0013, D-0014, D-0015, D-0017, D-0018, D-0020, D-0021]
deps: [T-0002]
status: ready
---
<!-- Groomed 2026-09-27 by product-owner. Build flow: wl-build-data. See "Size and proposed split". -->

## Why
`docs/data-model.md` is an eight-line draft with no types, keys, indexes or RLS, and no tables for
routines, variants or check-ins (gap B3). Every backend and app ticket (T-0102, T-0203, T-0300,
T-0308) builds on it. Offline-first logging (D-0017) only works if the database dedupes replays
and orders edits the way D-0015 says. Adaptive targets (principle 4, D-0018) need `plan_checkins`
and a fixed onboarding anchor. The PRD metrics (NFR-AN-2) need `onboarding_timing_ms` and SQL
over our own tables. This ticket turns the draft into the v1 contract and proves it with pgTAP.

**Folded-in follow-ups from T-0001/T-0002 (board, Phase 0):** `session_sets.client_id` unique per
user, `edited_at`, `deleted_at` + the upsert rule (D-0015); the `plan_checkins` table (D-0018);
`profiles.onboarded_at` and `profiles.onboarding_timing_ms` (NFR-AN-2, D-0014); pgTAP for replay
no-op, older edit ignored, tombstone excluded and cascade delete. All four are covered below
(AC9–AC12, AC17–AC18, AC22, AC26–AC27).

## Scope
- In:
  - `docs/data-model.md` v1: every table with column types, nullability, defaults, PK/FK/unique
    constraints, checks, indexes, triggers, views and RLS policies, per D-0015, D-0017, D-0018,
    D-0020 and D-0021. The Phase 1 status line changes from "draft" to "v1".
  - Tables: `profiles`, `areas` (the 9 rows are inserted by the migration), `area_targets`,
    `exercises`, `exercise_areas`, `exercise_variants`, `sessions`, `session_sets` (+ `client_id`,
    `edited_at`, `deleted_at`, `kind`, `rir`, `user_id`), `routines`, `routine_items`, `plan_checkins`.
    `users` is `auth.users` (D-0021).
  - The set-upsert guard trigger, the `session_sets_live` view (security invoker), write-once and
    server-set column triggers (D-0020).
  - Private `analytics` schema with the NFR-AN-2 metric views (D-0021).
  - `supabase/config.toml` from `supabase init`, with `site_url = "http://localhost:3000"` and the
    redirect allow-list from D-0011. Email (magic link) auth is on. **The Google provider stays
    disabled here** so that `supabase start` works in CI with no secrets. T-0203 enables it through
    `env(GOOGLE_OAUTH_CLIENT_ID)` / `env(GOOGLE_OAUTH_CLIENT_SECRET)` per D-0011 (follow-up).
  - pgTAP tests in `supabase/tests/database/`, run by `supabase test db` (the CI job in
    `.github/workflows/ci.yml` switches on once `config.toml` exists).
- Out: the exercise seed from `data/exercises` (T-0203), Edge Functions (T-0203), OpenAPI and
  generated `packages/shared` types (T-0102), the client queue (T-0300), applying migrations to
  the prod project `csgjsdwuxqtuqpuazzpz` (D-0011; that happens through T-0402 deploys only), a
  server-side 14-day load view (D-0021), JSON export (T-0310).

### Edge cases that are in scope
- **Offline:** a session and its sets are created on the device and synced days later. Client
  ids, replay no-ops and lenient checks mean the queue always flushes (AC9–AC15). A set that
  arrives before its session fails cleanly and succeeds on retry (AC30).
- **Time running out:** a session that ran past its budget is valid data (AC15). The metric
  boundary at budget + 120 s is exact (AC28).
- **Zero history:** a new user with a profile and targets but no sessions reads empty results
  with no errors, and the metrics return `null` instead of dividing by zero (AC15, AC28).
- **Returning after 10 days off:** sets whose `completed_at` is 10 days old sync normally. No
  constraint compares against `now()` (AC14).

## Acceptance criteria
Every AC is at least one pgTAP test in `supabase/tests/database/`. Tags **[a]** and **[b]** mark
the proposed split (see the end of this file).

Fixtures used below unless stated otherwise: user **A** = `00000000-0000-0000-0000-00000000000a`,
user **B** = `00000000-0000-0000-0000-00000000000b`, both in `auth.users`. "As A" means
`set local role authenticated` plus `request.jwt.claims` with `sub` = A. Exercises inserted by the
test as `postgres`: `back-squat` (compound; quads 1.0, glutes 1.0, hamstrings 0.5, core 0.5),
`bench-press` (compound; chest 1.0, shoulders 0.5, arms 0.5), `barbell-row` (compound; back 1.0,
arms 0.5), `plank` (isolation; core 1.0).

### Contract and structure
- **AC1 [a] (contract matches migration)** Given `docs/data-model.md` v1 and the migrated DB, When
  the schema test runs, Then every table and column in the doc exists with the documented type
  and nullability (`has_table`, `has_column`, `col_type_is`, `col_not_null`/`col_is_null`), and the
  doc cites D-0015, D-0017, D-0018, D-0020 and D-0021 next to the columns they introduced.
- **AC2 [a] (areas)** Given a fresh `supabase db reset`, When `select id from areas order by
  sort_order` runs, Then it returns exactly `chest, back, shoulders, arms, core, glutes, quads,
  hamstrings, calves`.
- **AC3 [a] (RLS everywhere)** Given the migrated DB, When `pg_class` is queried for ordinary tables
  in schema `public`, Then `relrowsecurity` is true for all of them and each has at least one
  policy in `pg_policies`. The number of public tables without RLS is 0.
- **AC24 [a] (indexes)** Given the migrated DB, Then indexes exist on `session_sets (user_id,
  completed_at)`, `sessions (user_id, started_at)` and the unique `session_sets (user_id,
  client_id)` (`has_index`, `has_unique`). **[b]** Also the unique `plan_checkins (user_id,
  period_index)` and `routine_items (routine_id, position)`.

### Row-level security (NFR-PRIV-3)
- **AC4 [a][b] (owner isolation)** Given A owns 1 row in each of `profiles`, `area_targets`,
  `sessions`, `session_sets` **[a]** and `routines`, `routine_items`, `plan_checkins` **[b]**, and B
  owns none, When B runs `select` on each table, Then 0 rows are returned; When B runs `update …
  where user_id = A` and `delete … where user_id = A`, Then 0 rows are affected and A's rows are
  unchanged; When B inserts a row with `user_id = A`, Then it fails with SQLSTATE `42501`. When A
  runs the same `select`, Then exactly 1 row per table is returned.
- **AC5 [a] (anon sees nothing owned)** Given the AC4 fixture, When role `anon` selects from each
  user-owned table, Then 0 rows are returned or `42501` is raised, and an insert raises `42501`.
- **AC6 [a] (library is public and read-only, D-0014, D-0021)** Given `back-squat` with its 4
  `exercise_areas` rows and a variant pair `back-squat ↔ barbell-row`, When `anon` and A select
  from `areas`, `exercises`, `exercise_areas` and `exercise_variants`, Then the rows are returned;
  When either role inserts, updates or deletes in those tables, Then it fails with `42501` or
  affects 0 rows, and a follow-up `select` as `postgres` shows the data unchanged. When
  `postgres` inserts the self-pair `back-squat ↔ back-squat`, Then it fails with `23514`.
- **AC7 [a] (no cross-user attach, D-0020)** Given session `S_A` owned by A, When B inserts a
  `session_sets` row with `session_id = S_A` and `user_id = B`, Then it fails with `23503` (the
  composite FK), and `S_A` still has 0 sets.

### Set sync (D-0015, D-0020, NFR-SYNC-1/-2)
Each sync AC writes with the exact statement supabase-js emits:
`insert into session_sets (…) values (…) on conflict (user_id, client_id) do update set <all
columns> = excluded.<col>`. Set `C1`: session `S1` of A, `back-squat`, `kind = 'reps'`, reps 8,
`weight_kg` 60, `completed_at = 2026-09-20T10:00Z`, `edited_at = 2026-09-20T10:00Z`.
- **AC8 [a] (area weights)** Given `back-squat`, When an `exercise_areas` row with weight 0.75 is
  inserted, Then it fails with `23514`. Weights 1.0 and 0.5 succeed.
- **AC9 [a] (replay is a no-op)** Given A has no sets, When A upserts `C1` twice with identical
  values, Then A has exactly 1 row with `client_id = C1`, reps 8, and `edited_at =
  2026-09-20T10:00Z`.
- **AC10 [a] (newer edit wins, completed_at immutable)** Given `C1`, When A upserts `C1` with reps
  10, `completed_at = 2026-09-21T09:00Z` and `edited_at = 2026-09-20T10:05Z`, Then the row has
  reps 10, `edited_at = 10:05Z`, and `completed_at` still `2026-09-20T10:00Z`.
- **AC11 [a] (older or equal edit ignored)** Given `C1` at reps 10 and `edited_at = 10:05Z`, When A
  upserts reps 6 with `edited_at = 10:02Z`, Then reps stay 10; When A upserts reps 7 with
  `edited_at = 10:05Z` (equal), Then reps stay 10.
- **AC12 [a] (tombstone)** Given A has `C1` and `C2`, both completed 2026-09-20, When A upserts `C1`
  with `deleted_at = edited_at = 2026-09-22T08:00Z`, Then `session_sets` still holds 2 rows for A
  and `session_sets_live` returns only `C2`. When an older replay of `C1` arrives (`edited_at =
  2026-09-21T00:00Z`, `deleted_at` null), Then `C1` stays tombstoned. When a newer edit arrives
  (`edited_at = 2026-09-23T00:00Z`, `deleted_at` null, an undo), Then `C1` is live again.
- **AC13 [a] (live view keeps RLS)** Given A and B each own 1 live set, When B selects from
  `session_sets_live`, Then exactly 1 row is returned and it is B's.
- **AC14 [a] (offline session, 10 days off)** Given A creates session `S1` offline with a
  client-supplied UUID and `started_at = now() - interval '10 days'`, When A upserts `S1` with
  `ended_at` null and then again with `ended_at = started_at + 45 min`, Then exactly 1 session row
  exists with that `ended_at` (last write wins, NFR-SYNC-3). When 3 sets with `completed_at` in
  that session (10 days ago) are upserted, Then all 3 are stored.
- **AC15 [a] (lenient checks, time running out, zero history)** Given A's profile and 9 targets and
  no sessions, When A selects from `session_sets_live`, Then 0 rows are returned with no error.
  When A inserts a session with `time_budget_min = 7`, Then it succeeds; with `0`, Then `23514`.
  When a session has `time_budget_min = 45` and `ended_at = started_at + 95 min`, Then it
  succeeds (running over is valid). When `ended_at < started_at`, Then `23514`.
- **AC16 [a] (set shape)** When A inserts a set with `kind = 'reps'` and `reps` null, Then `23514`;
  `kind = 'timed'`, `duration_s = 45`, `reps` null succeeds (UF-09.7); `rir = 6` gives `23514`,
  while `rir` 0, 5 and null succeed (UF-09.4); `weight_kg = -1` gives `23514`; `kind = 'sprint'`
  gives `23514`.
- **AC30 [a] (set arrives before its session, offline retry, D-0020)** Given A has no session
  `S9` (a client UUID), When A upserts set `C9` with `session_id = S9`, Then it fails with `23503`
  and A has 0 sets. When A then upserts `S9` and retries the same `C9` statement, Then exactly 1
  row with `client_id = C9` exists.
- **AC31 [a] (client_id collision across users)** Given A's `C1` at reps 8, When B upserts a set
  with the same `client_id = C1` (B's own session, reps 3, a newer `edited_at`) through `on
  conflict (user_id, client_id)`, Then B gets a new row of its own, and A's `C1` still has reps 8
  and its original `edited_at` (checked as `postgres`).

### Profile, targets and onboarding (D-0014, D-0018, D-0020, D-0021, NFR-AN-2)
- **AC17 [a] (onboarded_at is write-once)** Given A's profile with `onboarded_at =
  2026-08-02T09:00Z`, When A updates `onboarded_at` to `2026-09-01T09:00Z` and `rhythm_max` to 5
  in one statement, Then `onboarded_at` is still `2026-08-02T09:00Z` and `rhythm_max` is 5.
- **AC18 [a] (onboarding timing)** When A's profile is inserted with `onboarding_timing_ms = 41250`,
  Then it is stored; with `-1`, Then `23514`; with null (returning user from "I have an account"),
  Then it succeeds; with `5400000` (the tab was left open 90 min), Then it succeeds. Given a
  stored `41250`, When A updates it to `30000`, Then it stays `41250`.
- **AC19 [a] (plan fields)** Rhythm `(3,4)` and `(7,7)` succeed; `(0,2)`, `(5,4)` and `(3,8)` fail
  with `23514`. `priority_areas = '{back,hamstrings,arms}'` succeeds;
  `'{back,hamstrings,arms,chest}'` (4 items), `'{neck}'` and `'{back,back}'` fail with `23514`
  (UF-11.3 "Pick up to 3"). `goal = 'get_stronger'` succeeds; `goal = 'bulk'` gives `23514`.
- **AC20 [a] (plan_changed_at, the streak reset input)** Given A's profile with `plan_changed_at =
  T0`, When A changes `rhythm_min`, `goal` or `priority_areas`, Then `plan_changed_at` becomes the
  transaction's `now()`, not T0. When A changes only `equipment`, Then it stays T0. A
  client-supplied `plan_changed_at` is ignored.
- **AC21 [a] (targets are server-stamped)** Given A's `area_targets` row `(back, 20, 'default')`,
  When A updates it to `sets_per_14d = 25, source = 'adapted', updated_at = '2020-01-01'`, Then
  `updated_at = now()` (NFR-SYNC-3). `source = 'auto'` gives `23514`, `sets_per_14d = 0` gives
  `23514`, and a second row for `(A, back)` gives `23505`.

### Privacy
- **AC22 [a][b] (account deletion cascades, NFR-PRIV-5)** Given A owns a profile, 9
  `area_targets`, 2 sessions and 6 `session_sets` (1 tombstoned) **[a]**, plus 1 routine with 2
  items and 1 `plan_checkins` row **[b]**, and B owns 1 row in each table, When `delete from
  auth.users where id = A` runs as `postgres`, Then A's row count is 0 in every user-owned table
  and B's counts are unchanged.
- **AC23 [a] (data minimisation, NFR-PRIV-2)** Given `information_schema.columns` for schemas
  `public` and `analytics`, When column names are matched against
  `(dob|birth|sex|gender|body_?weight|heart|latitude|longitude|lat|lng|coord|email)`, Then 0
  columns match. `sessions.location` is `text` with `char_length(location) <= 32`, and a 33-char
  value gives `23514`.

### Routines and check-ins [b]
- **AC26 [b] (routines, UF-07.1 / UF-08.3)** Given A's routine R "Lower A" with items `(0,
  back-squat, 3 sets, 6–8 reps)` and `(1, plank, 3 sets, duration_s 45)`, When A inserts another
  item at position 1 in R, Then `23505`; `reps_min = 10, reps_max = 8` gives `23514`; When B
  inserts an item into R with `user_id = B`, Then `23503`; When A deletes R, Then its 2 items are
  gone.
- **AC27 [b] (plan_checkins lifecycle, D-0018, D-0021, UF-11.1)** Given A (onboarded 2026-08-02,
  rhythm 3–4), When A inserts `{period_index 3, completed_prev 4, completed_last 3,
  rhythm_before 3–4, proposed 2–3, proposed_at 2026-09-27T07:00Z, answer null, answered_at null}`,
  Then it is stored. When a second row for `(A, 3)` is inserted (a second device), Then `23505`.
  When A sets `answer = 'accepted', answered_at = 2026-09-27T07:01Z`, Then it is stored. Invalid
  rows fail with `23514`: `answer = 'accepted'` with `answered_at` null; `answered_at` set with
  `answer` null; `proposed 0–1`; `proposed 3–2`; `answer = 'maybe'`; `period_index = 0`.

### Metrics (NFR-AN-2, PRD success metrics) [b]
- **AC28 [b] (metric views against fixtures)** Fixtures are inserted as `postgres` inside the test
  transaction.
  - *Time to first plan:* profiles with `onboarding_timing_ms` 30000, 40000, 45000, 50000, 70000
    and one null. Then `analytics.time_to_first_plan` returns `p50 = 45000`, `p90 = 62000`
    (`percentile_cont`, nulls excluded).
  - *Finished within budget:* S1 budget 30, 31 min, 3 hard sets (within: 1860 ≤ 1920 s); S2
    budget 30, 33 min, hard sets (1980 > 1920, not within); S5 budget 20, exactly 22 min, hard sets
    (1320 ≤ 1320, within, the boundary); S3 warm-up sets only (excluded); S4 whose only hard sets
    are tombstoned (excluded); S6 with `ended_at` null (excluded). Then
    `analytics.finished_within_budget.ratio = 0.667` (rounded to 3 dp). With no qualifying
    sessions, Then `ratio` is `null` and no error is raised.
  - *Check-ins answered:* 5 rows with `proposed_at = 2026-09-01T08:00Z`: R1 accepted +3 d, R2
    kept +8 d, R3 unanswered, R4 kept at exactly +7 d 00:00:00, R5 withdrawn +2 d. Then
    `analytics.checkins_answered.ratio = 0.400` (R1 and R4 out of 5; `withdrawn` counts as shown
    but not answered).
  - *Areas on target after 4 weeks (UTC dates, D-0021):* let `d0 = (onboarded_at at time zone
    'UTC')::date`. A user is included when `d0 + 28 <= (now() at time zone 'UTC')::date` and has
    ≥ 4 completed sessions (≥ 1 live hard set, D-0018) with `started_at` dates in `d0..d0 + 28`.
    Load is measured over the window `d0 + 15 .. d0 + 28` (14 days, inclusive), whatever today's
    date is, so the result doesn't depend on when the test runs. U1 onboarded 2026-08-30 (day 28 =
    2026-09-27, window 2026-09-14..27), all 9 targets = 10, 4 sessions with hard sets in the
    window: 10 hard `back-squat`, 10 hard `bench-press`, 10 warm-up `barbell-row`, 10 tombstoned
    hard `barbell-row`, plus 10 hard `barbell-row` on 2026-09-13 (outside the window). U2 is
    onboarded the same day with 3 completed sessions (excluded, fewer than 4). U3 is onboarded
    `now() - 5 days` (excluded, day 28 not reached). Then
    `analytics.areas_on_target_day28.mean_share = 0.333` (quads, glutes, chest ≥ 10; back = 0).
- **AC29 [b] (analytics is private)** When `anon` or A selects from any `analytics.*` view, Then it
  fails with `42501`.

### Tooling
- **AC25 [a] (local and CI run)** Given a clean clone, Docker running and **no** `.env.local`, When
  `supabase start && supabase db reset && supabase test db` runs (CLI 2.118.0, as pinned in CI),
  Then every migration applies and all pgTAP files pass. The CI `supabase db tests` job runs these
  steps instead of no-opping. `pnpm -w typecheck lint test` stays green.

## Paths you may change
Data lane: `docs/data-model.md`, `supabase/migrations/**`. Extras for this ticket only (these
paths are owned by the backend lane; T-0203 depends on T-0100, so nothing overlaps):
- `supabase/config.toml`, `supabase/.gitignore` (from `supabase init`)
- `supabase/tests/database/**` (pgTAP)

Not `api/openapi.yaml` or `packages/shared/**` (T-0102), `supabase/seed.sql` (T-0203), or
`.github/**` (infra).

## Contract impact
`docs/data-model.md` changes from draft to v1. The changes are named by D-0015 (client_id,
edited_at, deleted_at, upsert), D-0017 (client_id), D-0018 (plan_checkins), D-0020 (write rules,
triggers, live view, lenient checks) and D-0021 (shape, vocabularies, routines, analytics).
`api/openapi.yaml` is unchanged. **Cost (D-0012):** none. Everything runs on local Docker, and
nothing is applied to the prod project here.

## Definition of done
Tests for every AC pass (`supabase test db`) · `pnpm -w typecheck lint test` green · contracts
unchanged or decision linked (see above) · commit messages start with `T-0100` and cite screen
IDs where relevant (e.g. `T-0100 UF-11.1: plan_checkins table`).

## Size and proposed split
This is **more than one day of agent work**: 11 tables, about 12 triggers and policies sets, a
metrics schema, and 31 ACs (about 35 pgTAP files or blocks). Proposed split (the orchestrator edits the board):
- **T-0100a (data, deps T-0002):** the contract doc for all tables, `config.toml`, migration 1
  (library, profiles, targets, sessions, sets, guard trigger, live view, write-once and
  server-set triggers, RLS), and every AC tagged **[a]**. It unblocks T-0102, T-0203 and T-0300.
- **T-0100b (data, deps T-0100a):** migration 2 (`routines`, `routine_items`, `plan_checkins`,
  the `analytics` schema), and every AC tagged **[b]**, including the [b] parts of AC4, AC22 and
  AC24. It unblocks T-0308. T-0102 needs only the `plan_checkins` shape, which is already fixed
  in D-0021.

## Accept log
- **2026-09-28, T-0100a, product-owner: done.** Every [a] AC (AC1–AC25 [a] parts) plus AC30,
  AC31 and the D-0029 `exercises` columns (TR-0003) maps to pgTAP assertions in
  `supabase/tests/database/001–007`. The real-stack CI `supabase db tests` job (AC25) is green on
  PR #1 after 45be5f6 (schema-qualified regclass in 007). Spot-checked AC9–AC13, AC30 and AC31
  (these use the exact supabase-js upsert statement and the exact AC fixtures) and AC22 (the
  cascade covers the tombstone, plus a structural check that every `user_id` FK cascades). D-0030
  (revisit) defaults don't weaken any AC. Part [b] stays pending in the doc until T-0100b.
  Principles: offline-first sync (replay, set before session, 10 days off) and adaptive-target
  inputs (`onboarded_at` write-once, `plan_changed_at` server-set) hold. Follow-ups: reject
  multi-dimensional `priority_areas` (review, data lane); T-0203 enables Google via env
  (D-0011).
- **2026-09-28, T-0100b, product-owner: failed (only the real-stack run is missing).** Every [b]
  AC maps to a pgTAP assertion that passes against real pgTAP 1.3.3 on a Postgres 16 stand-in
  (QA, 499/499): AC4 [b] (002), AC22 [b] (007), AC24 [b] (001), AC26 (008), AC27 (009), AC28 and
  AC29 (010), the extended AC1 block (001), plus the folded-in items: one-dimensional
  `priority_areas`, `sets_per_14d` 0 and −3, and the D-0024/D-0026/D-0027 engine columns (011).
  I spot-checked AC28: the fixtures match the ticket, and the views are real aggregations with
  `nullif` for zero history and the budget + 120 s boundary included. The one gap is the DoD
  item "tests pass under `supabase test db`". Migration 2 hasn't run on the real Supabase stack,
  and T-0100a showed that a stand-in pass can still fail there. AC29 in particular depends on
  Supabase's own default grants. No rebuild is needed: re-run accept with the green CI
  `supabase db tests` run from the draft PR. D-0035 (revisit) maps D-0027's `plan_updated_at` to
  `plan_changed_at`. An equipment-only Save doesn't reset the rule 9 streak, and that is
  consistent with principle 4. Follow-ups: `array_lower(priority_areas, 1) = 1` (data lane);
  rename in engine-rules.md rule 9 (engine lane).
