# Security review: T-0564 favorite_exercises table (2026-10-08)

Scope: `git diff main...t/T-0564-favorite-exercises-table`, mainly
`supabase/migrations/20261008120000_favorite_exercises.sql` and pgTAP 001/002/007/018/020.
Decisions: D-0202 §5, D-0199 §4, D-0201. Reviewer: security-reviewer. Read-only apart from this file.

**Verdict: approve.** No findings rated high or above.

## Checks

| Check | Result |
|---|---|
| Cross-user delete by the triggers | Safe. Both deletes filter `user_id = new.user_id and exercise_id = new.exercise_id`. Under `security invoker` the delete also passes through the caller's RLS delete/select policies (`auth.uid() = user_id`). The insert policy's `with check` pins `new.user_id` to `auth.uid()` before the after-insert trigger fires, so an authenticated caller can only ever reach their own rows. An RLS-bypassing caller (postgres, service_role) is still limited by the WHERE clause. |
| search_path | All three new functions use `set search_path = ''` and fully qualified names. They live in `private`. Trigger functions can't be called directly, so the default PUBLIC EXECUTE doesn't matter. |
| Recursion | None. Trigger A runs a DELETE on table B, and B only has an after-*insert* trigger (no delete triggers on either table). `on conflict do nothing` skips fire no after-insert trigger. |
| Grants, RLS, anon | Identical to `excluded_exercises` (20261007120000): `revoke all … from anon`, `revoke truncate, references, trigger … from authenticated`, `grant select, insert, update, delete … to authenticated`, RLS enabled, four owner policies with `(select auth.uid()) = user_id` and an update `with check`. The before-write trigger pins `user_id` and `created_at` on update. Both FKs cascade (auth user, exercise). |
| Prod apply safety (D-0201) | Additive. `create table`, `create index` on an empty table, three functions, two triggers. No DML runs at apply time, and no existing `excluded_exercises` row changes. The new trigger on `excluded_exercises` only takes a brief SHARE ROW EXCLUSIVE lock, on a small table. The `-- release: destructive-approved D-0202` header is backed by D-0202 (`status: decided`), which approves exactly these two trigger bodies. The builder's guard run passed, and a planted fault proved it catches the case. |
| pgTAP isolation proof | Adequate. 002 and 020 cover B select/update/delete/insert-for-A = 0 or 42501, anon 42501, and anon having no grants. 020 AC5 checks that B's matching row survives A's mutual-exclusion insert, in both directions. 007/020 cover the auth cascade, and 018 the owned-table list. |

## Findings (ranked)

### L1 (low): the mutual-exclusion tests run only under RLS, so they don't isolate the WHERE clause
In 020 AC5, A's insert runs as `authenticated`. If `user_id = new.user_id` were dropped from a trigger body, RLS would still hide B's rows and the test would stay green. Only RLS-bypassing callers (postgres, service_role, future Edge Functions) would then delete across users. No current function writes these tables with service_role, so nothing is exposed today. Suggested follow-up (lane: data-modeler): add one AC5 assertion that inserts as `postgres` (RLS bypassed) and checks that B's row survives.

### L2 (low, accepted by D-0202 §5): concurrent inserts can leave both rows
Two concurrent transactions (two devices) each delete a row the other hasn't committed yet, so both a favorite and an exclusion can survive. This is the same user's own data, not an isolation issue, and the engine resolves it (exclusion wins). No action needed.

### I1 (info): pgTAP hasn't been run locally
The build log says pgTAP runs only on the draft PR's `supabase` check. D-0201 releases on merge, so the orchestrator must not merge until that check is green.

## Out of scope / unchanged
CSP/headers, auth redirects, rate limits, secrets: not touched by this diff. Export (`apps/web/src/lib/account/export.ts`) gains `favorite_exercises` through supabase-js under the user's JWT, which is consistent with D-0136 data export.
