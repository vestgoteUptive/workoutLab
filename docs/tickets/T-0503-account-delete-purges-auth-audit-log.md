---
id: T-0503
title: "UF-11.4: account deletion also removes the user's auth.audit_log_entries (email, IP), with an AFTER DELETE trigger on auth.users; pgTAP plus a real-stack Deno proof (T-0406 P5-a)"
lane: backend
screens: [UF-11.4]
decisions: [D-0188, D-0135, D-0020, D-0030, D-0185]
deps: [T-0406]
status: ready
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main ccbae43 (D-0188 §1). Build flow:
wl-build-backend. About ⅓ day. Touches supabase/**, so it merges through a draft PR (D-0135). -->

## Why
NFR-PRIV-5 promises that, once the user confirms, the account and all its data are deleted
straight away. The T-0406 review (`docs/security/privacy.md`, NFR-PRIV-5, finding P5-a) found a
gap:
- Supabase Auth writes `auth.audit_log_entries` rows on sign-up, sign-in and delete. Their
  `payload` holds the actor's email, and the row holds the IP address.
- The table has no FK to `auth.users`, so the D-0020 cascade never reaches it.
- So after `DELETE /account` (`supabase/functions/account/admin.ts:22`,
  `auth.admin.deleteUser(userId, false)`), the deleted user's email and IP stay in the database.

The function can't delete those rows itself:
- D-0135 §3 forbids `.from(`, `.rpc(` and `.schema(` in `account/admin.ts`, and a static test
  fences it.
- The service-role client goes through PostgREST, which doesn't expose `auth`.

So D-0188 §1 puts the purge in the database: an `AFTER DELETE` trigger on `auth.users`, in the
same transaction as the delete.

## Scope
- **In:**
  - A migration `supabase/migrations/20261005120000_purge_auth_audit_on_user_delete.sql` (listed
    extra):
    - **Function.** `private.purge_auth_audit_for_user()` is a trigger function with
      `set search_path = ''`. It deletes from `auth.audit_log_entries` every row where any of
      these holds:
      - `payload->>'actor_id' = old.id::text`;
      - `payload->'traits'->>'user_id' = old.id::text`;
      - `old.email is not null` and `payload->>'actor_username' = old.email`;
      - `old.email is not null` and `payload->'traits'->>'user_email' = old.email`.

      `payload` is `json`, not `jsonb`. `->>` works on both. Use exact equality only: no
      `like`, `ilike` or `payload::text` match.
    - **Trigger.** `auth_users_purge_audit` is `after delete on auth.users for each row`.
    - **Grants.** GoTrue fires the trigger as `supabase_auth_admin`, so that role needs usage on
      `private` and execute on the function. Choose `security definer` (owner `postgres`) or
      invoker so that a delete by GoTrue **and** a delete by `postgres` (pgTAP) both work.
      Record which you chose and why in the migration header.
    - **Exposure.** No grant to `anon` or `authenticated`.
      `015_rls_every_table.test.sql:122` and `infra/scripts/rls-fingerprint.sql` must stay green.
    - **Optional, only if AC-3 shows it's needed.** If GoTrue writes its own `user_deleted`
      entry after the user row is gone, add a `before insert on auth.audit_log_entries` trigger.
      For `payload->>'action' = 'user_deleted'` rows it removes `user_email` and `user_phone`
      from `traits` (D-0188 §1).
  - `docs/data-model.md` (listed extra):
    - a new section **"Auth schema triggers"** after "Conventions", naming the trigger, its
      function, the four match keys and D-0188;
    - one sentence in the Ownership bullet: the audit purge rides on the same delete;
    - the Status line lists the new migration.
  - pgTAP `supabase/tests/database/016_auth_audit_purge.test.sql` (new).
  - The Deno integration test `supabase/tests/functions/integration/account-delete.test.ts`
    gains AC-3. Read `auth.audit_log_entries` with `psql` on `DB_URL`, the way
    `seed-roundtrip.test.ts:61-92` does: `--allow-run=psql` is already in the CI command,
    `supabase/tests/scripts/ci-order.test.mjs:39`. The test may take the email from
    `createTestUser`. Change `helpers.ts` to return it if needed. That's additive and keeps the
    other callers working.
  - The D-0135 "no data-model change" comment, if `account/admin.ts` or `core.ts` repeats it,
    gets a one-line pointer to D-0188. No code change in `supabase/functions/account/`.
- **Out:**
  - Any change to `admin.ts` behaviour, the D-0135 §3 fence or its static test.
  - `auth.flow_state` (GoTrue expires those rows; T-0406 didn't flag it as needing a fix).
  - Supabase platform logs (P7-b, processor side, disclosed by T-0502).
  - Backups (P5-b, disclosed by T-0502).
  - Turning off audit logging (the fallback, see Notes).
  - The prod release (H-23, D-0188 §4).

### Edge cases that are in scope
- **Another user's rows:**
  - B's entries stay.
  - So do the entries of a user whose email contains A's as a substring (`ba@test.local` vs
    `a@test.local`) (AC-1).
- **A user with no email** (phone-only or anonymous): the email match keys are skipped, and
  the id match still runs (AC-2).
- **A user with no audit rows:** the delete still succeeds (AC-2).
- **The service-role actor:** entries whose actor is the service role but whose `traits.user_id`
  is A (admin `createUser`'s `user_signedup`) are removed (AC-1, AC-3).
- **Performance:** T-0310b AC10 (400 sessions, 5,000 sets deleted in under 10 s) must stay
  green with the trigger in place.

## Acceptance criteria
Each pgTAP description and each Deno test name starts with `T-0503 AC-n`.

- **AC-1 (pgTAP: exact-key purge, red on main)**
  - **Given** users A (`…000a`, `a@test.local`), B (`…000b`, `b@test.local`) and C (`…000c`,
    `ba@test.local`) in `auth.users`, and these `auth.audit_log_entries` rows (`instance_id`
    `0000…`, `ip_address` `'203.0.113.7'`):
    - `{"action":"login","actor_id":"<A>","actor_username":"a@test.local"}`;
    - `{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","traits":{"user_id":"<A>","user_email":"a@test.local"}}`;
    - `{"action":"user_modified","actor_id":"<some other uuid>","actor_username":"a@test.local"}`
      (an email-only match);
    - one `login` row each for B and C.
  - **When** `delete from auth.users where id = '<A>'`.
  - **Then**:
    - 0 rows match A by any of the four keys;
    - B's row and C's row are still there (`count = 2` for actor_id in (B, C));
    - `has_trigger('auth', 'users', 'auth_users_purge_audit')`.

  **Red:** on main the A count is 3.
- **AC-2 (pgTAP: no email, no rows)**
  - **Given** user D with `email` null and one row with `actor_id = D`, and user E with no audit
    rows.
  - **When** both are deleted.
  - **Then** both deletes succeed (`lives_ok`), and D's row is gone.
- **AC-3 (Deno, real stack: through `DELETE /account`, red on main)** Extend
  `account-delete.test.ts`:
  - **Given** `createTestUser()` for A and B (each signs in with a password, so GoTrue writes
    real `login` rows). **Precondition:** `psql` shows at least 1 `auth.audit_log_entries` row
    with `payload->>'actor_id' = A`. If it shows 0, Postgres audit logging is off locally, the
    test is void, and the builder stops with `needs-triage`.
  - **When** A calls `DELETE /account` (204).
  - **Then**:
    - `select count(*) from auth.audit_log_entries where payload::text like '%' || <A id> || '%' or payload::text ilike '%' || <A email> || '%'`
      returns 0. A substring match is fine **in the test**, because the test emails are unique.
    - B's `login` row count is unchanged and at least 1.
    - The existing T-0310b AC8 to AC10 assertions still pass.

  **Red:** on main the count is at least 1.
- **AC-4 (fence intact)** `supabase/tests/scripts/functions-platform.test.mjs` (the D-0135 §3
  allow-list) passes unchanged, and `git diff main -- supabase/functions/account/admin.ts` shows
  no code change.
- **AC-5 (not exposed)**
  - pgTAP: `anon` and `authenticated` have no execute on
    `private.purge_auth_audit_for_user()`
    (`function_privs_are('private', 'purge_auth_audit_for_user', array[]::text[], 'anon', array[]::text[])`
    and the same for `authenticated`).
  - `015_rls_every_table.test.sql` stays green.

**Red proof.**
- Run AC-1 and AC-3 on main (trigger absent): both must fail.
- Then plant one fault on a backup copy of the migration: change the email key from `=` to
  `like '%' || old.email || '%'`, and add C's row to the expectation. AC-1's "C's row stays"
  must fail.
- Restore with `cp`. Record every run.

## Paths you may change
- **Lane `backend`:** `supabase/tests/**` (here `database/016_auth_audit_purge.test.sql`,
  `functions/integration/account-delete.test.ts`, `functions/integration/helpers.ts`), and
  comments only in `supabase/functions/account/**`.
- **Listed extras:**
  - `supabase/migrations/20261005120000_purge_auth_audit_on_user_delete.sql` (new, data lane
    path, named by D-0188 §1);
  - `docs/data-model.md` (the "Auth schema triggers" section, the Ownership sentence and the
    Status line, D-0188 §1);
  - `docs/tickets/T-0503-account-delete-purges-auth-audit-log.md`, for the build and accept logs.

## Contract impact
`docs/data-model.md` gains the "Auth schema triggers" section (D-0188 §1, amends D-0135 §5).
No change to `api/openapi.yaml`, the engine or tokens. `packages/shared/src/database.gen.ts`
doesn't change, because `private` and `auth` aren't generated. If the stack is up, confirm it
with `pnpm --filter @workoutlab/shared gen:db` and an empty `git diff`.

## Definition of done
- Every AC passes on the real local stack:
  - `supabase test db`;
  - the Deno integration suite (the CI command in `ci-order.test.mjs:39`).
- The red runs and the planted fault are recorded.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- No web e2e is needed: there's no `apps/web` change.
- Commits start `T-0503` and cite UF-11.4.
- **Prod:** this ticket ends at merge. The migration reaches prod at H-23 (D-0188 §4): the
  human-run `infra/scripts/supabase-prod-release.sh`, plan then apply. Don't run it.

## Notes
- **Parallel:**
  - Runs alongside T-0502 (`apps/landing/src/content/**`) and the in-flight T-0404b
    (`infra/auth/**`, `infra/scripts/auth-*`, `.github/scripts/auth-*`): no shared path.
  - T-0504 waits for this ticket (D-0188 §3). Both add a migration and edit
    `docs/data-model.md`.
- **Fallback (D-0188 §1).** If the trigger can't be created or can't delete on the local stack
  (permission denied for `postgres` or `supabase_auth_admin`), or AC-3's email still survives
  with the optional scrub in place, return `needs-triage`. The alternative then is to turn off
  Postgres audit logging in prod:
  - it's a prod auth setting, changed by the human under D-0185 §4 (dashboard, or a reviewed
    keys-only PATCH with the before/after in the log);
  - it gets its own infra ticket after T-0404b, which also extends
    `infra/auth/expected-auth.json`;
  - don't guess the setting's key name. The infra ticket finds it read-only.
- Local Supabase mirrors prod's grants closely (T-0402c: local RLS fingerprint = prod), so a
  green local run is good evidence that the prod `db push` works. H-23's plan mode is the last
  check.

## Build / accept log
Archived in `docs/tickets/log/T-0503.md` (D-0157).
