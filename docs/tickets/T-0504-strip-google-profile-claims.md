---
id: T-0504
title: "UF-01.5: Google sign-in no longer stores name or avatar. BEFORE INSERT/UPDATE triggers strip the profile keys from auth.users.raw_user_meta_data and auth.identities.identity_data; pgTAP plus a real-GoTrue sign-in proof (T-0406 P2-a, NFR-PRIV-2)"
lane: data
screens: [UF-01.5]
decisions: [D-0188, D-0011, D-0030, D-0017]
deps: [T-0406, T-0503]
status: todo
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main ccbae43 (D-0188 §2). Build flow:
wl-build-data. About ⅓ day. Waits for T-0503: both add a migration and edit docs/data-model.md
(D-0188 §3). -->

## Why
NFR-PRIV-2 says we collect email, training data and plan settings only. The T-0406 review
(`docs/security/privacy.md`, NFR-PRIV-2, finding P2-a) found that "Continue with Google"
(`apps/web/src/features/UF-01/AccountScreen.tsx:97-100`) stores more than that:
- Supabase's Google provider always requests the `email profile` scopes.
- It then stores the user's full name and avatar URL in `auth.users.raw_user_meta_data` and
  `auth.identities.identity_data`.
- Nothing reads them: there's no `user_metadata`, `full_name` or `avatar_url` in
  `apps/web/src`, `supabase/functions` or `packages/shared/src`.
- The schema test `001_schema.test.sql:300-306` checks only `public` and `analytics`.

D-0188 §2 picks **strip** over **disclose**:
- Disclosing the fields as stored would rewrite NFR-PRIV-2 instead of meeting it.
- The minimal-scope route isn't available. The provider's `email profile` is fixed, and
  `scopes` can only add.

## Scope
- **In:**
  - A migration `supabase/migrations/20261005130000_strip_auth_profile_claims.sql`. Its
    timestamp is later than T-0503's `20261005120000_…`.
    - **Function.** `private.strip_profile_claims(j jsonb) returns jsonb`, immutable,
      `set search_path = ''`. It returns `j - array['name','full_name','avatar_url','picture','given_name','family_name','nickname','preferred_username','custom_claims']`,
      and null for null.
    - **On `auth.users`.** A trigger function `private.auth_users_strip_profile()` and the
      trigger `auth_users_strip_profile`,
      `before insert or update of raw_user_meta_data on auth.users for each row`. It sets
      `new.raw_user_meta_data := private.strip_profile_claims(new.raw_user_meta_data)`.
    - **On `auth.identities`.** A trigger function `private.auth_identities_strip_profile()` and
      the trigger `auth_identities_strip_profile`,
      `before insert or update of identity_data on auth.identities for each row`. It does the
      same on `identity_data`.
    - **Keys kept.** `sub`, `iss`, `email`, `email_verified`, `phone_verified`,
      `provider_id`, and any key not on the list. `auth.identities.email` is a generated column
      over `identity_data->>'email'`, so `email` must stay.
    - **Grants.** GoTrue writes as `supabase_auth_admin`. Give it what the triggers need (usage
      on `private`, execute), the same way T-0503's migration does. Reuse T-0503's grant if it
      already covers this. No grant to `anon` or `authenticated`.
  - **Existing rows.** The migration also runs a one-off update that applies the strip to the
    existing rows in both tables. Prod already has real users from H-19's smoke tests, and
    Google users in dev.
  - `docs/data-model.md`: add the triggers to T-0503's "Auth schema triggers" section, add the
    key list, and list the migration on the Status line. Also add a sentence to the Users
    convention (line 8): only email and the auth keys above are kept, and provider profile
    claims are stripped (NFR-PRIV-2, D-0188).
  - pgTAP `supabase/tests/database/017_auth_profile_claims.test.sql` (listed extra, new).
  - Deno integration `supabase/tests/functions/integration/auth-profile-claims.test.ts`
    (listed extra, new). It uses `helpers.ts` (`adminClient`, `anonClient`, `requireEnv`) and
    doesn't change it.
- **Out:**
  - Any web change. Nothing reads the fields, and UF-01.5's Google button stays.
  - The notice sentence (T-0502 writes it, D-0188 §5).
  - `auth.sessions` IP and user agent (P2-b: needed for sign-in security, and disclosed by
    T-0502).
  - The export (P4-b shrinks on its own).
  - The prod release (H-23).

### Edge cases that are in scope
- **Null or empty metadata:** an insert with `raw_user_meta_data` null or `{}` succeeds and
  stays as it was (AC-3).
- **Email users:** their metadata (`sub`, `email`, `email_verified`, `phone_verified`) is
  unchanged (AC-3).
- **A returning Google user:** GoTrue rewrites `identity_data` and `raw_user_meta_data` with
  fresh claims on every OAuth sign-in. The update path strips them again (AC-2).
- **A user calling `updateUser({ data: { full_name } })`:** stripped too, on the update path
  (AC-4). That's intended: we keep no names, whatever the source.
- **Linking:** GoTrue matches identities by `provider_id` and `email`, and both are kept. A real
  Google round-trip can't run locally, so H-23 has a one-time prod check (Notes).

## Acceptance criteria
Each pgTAP description and each Deno test name starts with `T-0504 AC-n`.

- **AC-1 (pgTAP: insert path, red on main)**
  - **Given** a Google-shaped claim set:

    ```
    G = {"iss":"https://accounts.google.com","sub":"g-123","email":"g@test.local",
         "email_verified":true,"phone_verified":false,"provider_id":"g-123",
         "name":"Ada L","full_name":"Ada L","given_name":"Ada","family_name":"L",
         "avatar_url":"https://lh3.example/a.png","picture":"https://lh3.example/a.png",
         "custom_claims":{"hd":"example.com"}}
    ```
  - **When** a user `…00g1` is inserted into `auth.users` with `raw_user_meta_data = G`, and an
    `auth.identities` row (provider `google`, `provider_id` `g-123`, user `…00g1`) with
    `identity_data = G`.
  - **Then**:
    - both stored values equal exactly
      `{"iss":"https://accounts.google.com","sub":"g-123","email":"g@test.local","email_verified":true,"phone_verified":false,"provider_id":"g-123"}`
      (`is(…::jsonb, …::jsonb)`);
    - `auth.identities.email` reads `g@test.local`;
    - `has_trigger` holds for both triggers.

  **Red:** on main the stored values still hold `full_name` and `picture`.
- **AC-2 (pgTAP: update path)**
  - **When** `update auth.users set raw_user_meta_data = raw_user_meta_data || '{"full_name":"X","picture":"p"}'`
    and the same update on `identity_data`.
  - **Then** neither row holds `full_name` or `picture`, and `sub` and `email` are unchanged.
- **AC-3 (pgTAP: harmless for others)**
  - An `auth.users` insert with `raw_user_meta_data` null stays null.
  - One with `{}` stays `{}`.
  - An email user's `{"sub":"<id>","email":"e@test.local","email_verified":true,"phone_verified":false}`
    is stored unchanged.
  - `private.strip_profile_claims(null)` is null.
- **AC-4 (Deno, real GoTrue: sign-in still works, red on main)**
  - **Given** `adminClient().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Ada L", avatar_url: "https://lh3.example/a.png", name: "Ada L" } })`.
  - **Then**:
    - `admin.auth.admin.getUserById(id)` returns `user_metadata` with none of `full_name`,
      `avatar_url` or `name`;
    - `anonClient().auth.signInWithPassword({ email, password })` returns a session, so sign-in
      isn't broken;
    - the session's `user.user_metadata` has none of the three keys;
    - after that user calls `updateUser({ data: { full_name: "B" } })` (no error),
      `getUserById` still shows no `full_name`.
  - Clean up with `admin.auth.admin.deleteUser(id)`.

  **Red:** on main, `getUserById` shows `full_name: "Ada L"`.
- **AC-5 (backfill)** pgTAP:
  - **Given** a row inserted with the triggers disabled (`alter table … disable trigger …`
    inside the test transaction) and `raw_user_meta_data = G`.
  - **When** the migration's backfill statement runs again.
  - **Then** the row is stripped, and the statement is idempotent: a second run changes 0 rows.

  Put the backfill in a named function `private.strip_profile_claims_backfill()`, called once by
  the migration, so the test can call it.
- **AC-6 (not exposed)**
  - `anon` and `authenticated` have no execute on the four new `private` functions
    (`function_privs_are`).
  - `015_rls_every_table.test.sql` stays green.

**Red proof.**
- Run AC-1 and AC-4 on main: both must fail.
- Then plant one fault on a backup copy of the migration: remove `'picture'` from the key list.
  AC-1 must fail.
- Restore with `cp`. Record every run.

## Paths you may change
- **Lane `data`:** `supabase/migrations/**` (here only the new
  `20261005130000_strip_auth_profile_claims.sql`), `docs/data-model.md`. Not
  `api/openapi.yaml` or `packages/shared/**`, which don't change.
- **Listed extras:**
  - `supabase/tests/database/017_auth_profile_claims.test.sql` (new);
  - `supabase/tests/functions/integration/auth-profile-claims.test.ts` (new);
  - `docs/tickets/T-0504-strip-google-profile-claims.md`, for the build and accept logs.

## Contract impact
`docs/data-model.md`: the "Auth schema triggers" section and the Users convention (D-0188 §2).
No change to the API, the engine or tokens. `database.gen.ts` doesn't change. If the stack is up,
confirm it with `pnpm --filter @workoutlab/shared gen:db` and an empty `git diff`.

## Definition of done
- Every AC passes on the real local stack:
  - `supabase test db`;
  - the Deno integration suite (the CI command in
    `supabase/tests/scripts/ci-order.test.mjs:39`).
- The red runs and the planted fault are recorded.
- `npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`,
  `-w format:check` and `node .github/scripts/check-all.mjs` are green, each through
  `scripts/locked.sh` (D-0169).
- No web e2e is needed.
- Commits start `T-0504` and cite UF-01.5.
- **Prod:** this ticket ends at merge. The migration reaches prod at H-23 (D-0188 §4). Don't
  run the release script.

## Notes
- **Sequencing:** waits for T-0503 (D-0188 §3). It runs alongside T-0502 and T-0404b: no
  shared path.
- **H-23 one-time check** (for the human, after the release apply):
  - sign in once with Google on the app;
  - in the dashboard's SQL editor (read-only), confirm that the user's `raw_user_meta_data` and
    the google `identity_data` hold none of the stripped keys;
  - confirm that a second sign-in still works.

  If Google sign-in breaks, roll back by dropping the two triggers in a follow-up migration.
  Disclosure (T-0502) then becomes the fallback, under D-0188 "Revisit when".
- **If `postgres` can't create a trigger on `auth.identities`** on the local stack, return
  `needs-triage`. Stripping `auth.users` alone wouldn't meet NFR-PRIV-2.

## Build / accept log
Archived in `docs/tickets/log/T-0504.md` (D-0157).
