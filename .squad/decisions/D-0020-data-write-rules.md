---
id: D-0020
title: Data model v1 write rules — client-generated ids, a guard trigger enforces the D-0015 set upsert, write-once and server-set columns, lenient checks on offline-synced rows
status: revisit
date: 2026-09-27
by: product-owner (T-0100 groom)
area: data
---
## Context
D-0015 fixes the set-sync semantics (one row per `(user_id, client_id)`, the newer `edited_at` wins, tombstones), but supabase-js `upsert()` emits `insert … on conflict … do update set …` with no `where` clause. Plain CRUD goes through supabase-js + RLS (D-0001), so the rule has to hold on that path too. Offline-first logging (D-0017, NFR-OFF-2/-4) also means a session can be created on the device days before the server sees it, and a queued row that fails a check constraint can never flush. D-0018 anchors check-in periods on the onboarding day, so that anchor must not drift. This decision names the matching changes to `docs/data-model.md`.

## Decision
- **Ownership column everywhere.** Every user-owned table (`profiles`, `area_targets`, `sessions`, `session_sets`, `routines`, `routine_items`, `plan_checkins`) has `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`. RLS on each: `select/insert/update/delete` only where `user_id = auth.uid()` (insert and update use `with check`). Child rows use a composite FK to the parent on `(parent_id, user_id)`, so a user cannot attach a row to someone else's parent even when FK checks bypass RLS.
- **Client-generated ids for offline rows.** `sessions.id` and `session_sets.client_id` are UUIDs made on the device (`sessions.id` keeps `default gen_random_uuid()` for server-side inserts). The client syncs a session row before its sets. A set whose session hasn't arrived fails the FK and stays in the queue for retry (T-0300).
- **Set upsert guard.** A `before update` row trigger on `session_sets`:
  - returns `NULL` (skips the update) when `NEW.edited_at <= OLD.edited_at`, so a replay or an older edit is a no-op;
  - otherwise forces `NEW.completed_at := OLD.completed_at` (immutable, D-0015).
  This makes the D-0015 rule hold for supabase-js `upsert(rows, { onConflict: 'user_id,client_id' })`, for raw SQL, and for any future RPC.
- **Live view.** `session_sets_live` = `session_sets where deleted_at is null`, created `with (security_invoker = true)` so RLS still applies. Engine loads, balance and metric queries read from it.
- **Write-once columns.** `profiles.onboarded_at` and `profiles.onboarding_timing_ms`: once non-null, later updates keep the old value (the trigger resets them silently, with no error, so a full-profile upsert from a second device never fails).
- **Server-set columns (NFR-SYNC-3).** `area_targets.updated_at`, `profiles.updated_at`, `routines.updated_at`, and `profiles.plan_changed_at` (when goal, rhythm or priority areas change) are set to `now()` by trigger, whatever the client sends.
- **Lenient checks on offline-synced rows.** Constraints on `sessions` and `session_sets` reject only impossible values, never values a valid client can produce offline: no `now()`-relative checks (so a set completed 10 days ago, or with a skewed clock, still syncs); `time_budget_min between 1 and 480`; `ended_at is null or ended_at >= started_at`; no rule tying duration to budget (running over time is valid data); `weight_kg >= 0`; `rir between 0 and 5`; `kind = 'reps'` requires `reps >= 0`, `kind = 'timed'` requires `duration_s > 0`.

## Consequences
- data (T-0100): `docs/data-model.md` gets these columns, triggers, the view and the policies. pgTAP covers each bullet.
- web-shell (T-0300): upsert sessions before sets; write sets through `upsert(…, { onConflict: 'user_id,client_id' })`; read history from `session_sets_live`.
- engine (T-0101/T-0202): the rule 9 streak reset reads `profiles.plan_changed_at` and the latest answered `plan_checkins.answered_at` (D-0021).

## Revisit when
The same triggers as D-0015 (clock skew loses an edit; real two-device editing), or when a queued row fails a constraint in testing.
