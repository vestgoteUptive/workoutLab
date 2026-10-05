---
id: T-0402c
title: "Prove RLS scopes a signed-in preview tester to their own rows on every table a preview touches (local pgTAP + prod policy fingerprint + anon probes), then add https://*.workoutlab-web.pages.dev/** to prod's redirect allow-list with a human-run keys-only PATCH (D-0184 §6, D-0185 §4, D-0186 §1)"
lane: infra
screens: [UF-01.5]
decisions: [D-0011, D-0020, D-0184, D-0185, D-0186]
deps: [T-0402a, T-0402b, T-0500]
status: todo
groomed: 2026-10-05
---
<!-- Groomed 2026-10-05 by product-owner against main c378ddf (D-0186 §1). Build flow:
wl-build-infra. About ½ day across run A (proof + scripts, stop), the human's two runs
(fingerprint, then PATCH) and a read-only verify. The allow-list change never ships before
AC-1 to AC-4 are green. -->

## Why
**The named risk (D-0184 §5).** There's no staging. A preview build talks to the **prod**
Supabase project, so a tester signed in on a preview reads and writes **real prod data**. The
only thing that keeps that tester inside their own rows is row-level security.

T-0402a's previews are signed-out by construction. Prod's redirect allow-list doesn't contain
the preview origin, so a magic link or Google sign-in started on a preview returns to
`site_url`, never to the preview. Opening that door is this ticket. D-0184 §6 requires proof
that RLS holds **on every table a preview touches** before the door opens. D-0185 §4 requires
the change itself to be a reviewed, keys-only change, with the drift check's expected file
updated in the same ticket.

The proof has three parts, because no single one is enough:
- Local pgTAP proves the policies **behave** right, with two users.
- A coverage test proves pgTAP covers **every** table the app reaches.
- A fingerprint proves prod's policies are **the same** as the ones pgTAP tested.

## Scope
- **In:**
  - **Proof part 1:** `supabase/tests/database/015_rls_every_table.test.sql`, a pgTAP catalog
    test that runs in CI's `supabase` job. It asserts:
    - every ordinary table in `public` has `relrowsecurity = true`;
    - the library tables (`areas`, `exercises`, `exercise_areas`, `exercise_variants`) have
      `select` policies only, and `anon`/`authenticated` hold no `INSERT`/`UPDATE`/`DELETE`
      privilege on them, or RLS denies every write. Assert whichever holds today, and state
      which in the log;
    - every other `public` table has a `user_id` column, and for each of `SELECT`, `INSERT`,
      `UPDATE` and `DELETE` there is a policy for `authenticated` whose `qual` (or
      `with_check` for `INSERT`) references both `auth.uid()` and `user_id`;
    - every view in `public` has `security_invoker = true` in `reloptions`;
    - `anon` and `authenticated` have no `USAGE` on the schemas `analytics` and `private`.
  - **Proof part 2:** `.github/scripts/rls-coverage.test.mjs` (node:test):
    - It scans `apps/web/src/**/*.{ts,tsx}`, excluding tests, for `.from("<name>")` and
      `/functions/v1/<name>`. A `.from(` whose argument isn't a string literal fails the test,
      so a dynamic table name can't slip by.
    - Every table found must be a library table, or appear in
      `supabase/tests/database/002_rls_owner.test.sql`'s two-user isolation asserts. Read that
      file and match its `from public.<name>` occurrences.
    - Every view found (`session_sets_live`) must be `security_invoker` in the migrations.
    - Every function found (today only `account`) must have an owner-scoping integration test
      in `supabase/tests/functions/integration/` (`account-delete.test.ts`).
    - Expected today: 12 names. The 10 tables `area_targets`, `exercise_areas`, `exercises`,
      `exercise_variants`, `plan_checkins`, `profiles`, `routine_items`, `routines`,
      `sessions` and `session_sets`, the view `session_sets_live`, and the function `account`.
      The test prints the list it found.
  - **Proof part 3:** the policy fingerprint.
    - `infra/scripts/rls-fingerprint.sql` is one read-only query. It emits sorted text lines for:
      each `public` relation (name, relkind, relrowsecurity, relforcerowsecurity, reloptions);
      every `pg_policies` row for `public` (table, name, permissive, sorted roles, cmd, qual,
      with_check); every `information_schema.role_table_grants` row for grantees `anon` and
      `authenticated` in `public`; and `has_schema_privilege` for those roles on `analytics`
      and `private`.
    - `infra/scripts/rls-fingerprint.sh <db-url-env-var-name>` runs it with
      `PGOPTIONS='-c default_transaction_read_only=on' psql -At`, then prints `lines=<n>
      sha256=<hex>`.
    - `--dump` prints the lines. They are schema metadata only, so they're safe to diff.
    - The builder runs it on local Docker (`DB_URL`). The human runs it on prod (`PROD_DB_URL`,
      as in T-0402b).
  - **The change:** `infra/scripts/auth-patch.mjs`, a generic keys-only PATCH tool reused by
    T-0404b and T-0402d:
    - `--add-to-list uri_allow_list=<entry>` and `--set <key>=<value>` build the change from
      the **live** value. A list keeps every live entry and appends the new one.
    - With no `--apply`, it prints only the filtered before/after of the changed keys, plus
      `others_sha256=<hex>`: a hash of the raw config with the changed keys removed. Only the
      hash is printed.
    - With `--apply` **and** `CONFIRM_PROD_AUTH=<ref>`, it sends one `PATCH
      /v1/projects/<ref>/config/auth` whose body holds **only** the changed keys. Then it GETs
      again and prints the after-view and the `others_sha256`, which must equal the
      before-value.
    - A value for any key matching `/secret|pass|key|token/` is read from an environment
      variable named in the argument (`--set-from-env smtp_pass=RESEND_API_KEY`) and is never
      printed. The before/after show `<set>` / `<unset>`.
    - Its tests: `.github/scripts/auth-patch.test.mjs` with an injected fetch.
  - `infra/auth/expected-auth.json` (T-0500): `uri_allow_list` gains
    `https://*.workoutlab-web.pages.dev/**`, in the same commit as the PATCH script run is
    planned.
  - `infra/deploy/README.md` (T-0402a): replace the "previews are signed-out" paragraph with the
    new state and the risk statement.
- **Out:**
  - The landing host, which isn't added (D-0186 §1), and the `site_url` switch (T-0402d).
  - Any change to a migration or policy. If the proof finds a hole, that's a **data-lane** ticket
    and this ticket returns `needs-triage`. Never patch a policy here.
  - Any change to the Google Cloud OAuth client. Google returns to Supabase's callback, and
    Supabase then honours the allow-list, so no Google change is needed (D-0011).
  - Writing test rows to prod. Live proof is read-only, except for the human's own sign-in in
    AC-7.

### Edge cases that are in scope
- **Fingerprint mismatch between local and prod.** Stop, and don't PATCH. Put both `--dump`
  outputs' diff in the log (schema metadata, safe), and return `needs-triage` (D-0186 §1,
  fallback: reinstate staging per D-0184).
- **The coverage test finds a table not in 002's isolation asserts.** That's a missing isolation
  test, so return `needs-triage` naming the table. A backend/data follow-up adds the test, and
  this ticket waits.
- **Live allow-list order** differs from D-0011 (T-0400 saw it reordered). `--add-to-list`
  keeps the live order and appends.
- **A preview alias contains a dot-free label of 28 or more characters.** Supabase's glob `*`
  matches one host label, and Pages aliases are a single label, so the pattern covers both
  `<hash>.workoutlab-web.pages.dev` and `<alias>.workoutlab-web.pages.dev`. AC-7 proves it with
  a real alias.
- **The PATCH answers 2xx, but `others_sha256` changed.** Some other key moved, possibly by
  Supabase in the same window. Run the drift check, record it, and return `needs-triage`. Don't
  try to revert.

## Acceptance criteria
Node:test titles start with `T-0402c AC-n`. The pgTAP test's descriptions start with
`T-0402c AC-1`.

- **AC-1 [static, pgTAP] Every table has RLS, and owned tables are owner-scoped.**
  - **Given** a local `supabase db reset`, **when** `supabase test db` runs, **then**
    `015_rls_every_table.test.sql` passes. That covers every `public` table and view, and both
    private schemas.
  - Planted fault, recorded: with `psql "$DB_URL"` on the **local** Docker DB (no migration
    file), create `public.tmp_owned (user_id uuid)` without RLS, then run `supabase test db`.
    015 goes red, naming `tmp_owned`. Restore with `supabase db reset`.
- **AC-2 [static] Coverage of what the app reaches.**
  - **Given** `apps/web/src`, **then** the found set is exactly the 12 names in Scope, and each
    one is covered as described there.
  - Planted fault, recorded: a fixture source file with `.from("new_table")` makes the test fail
    and name `new_table`. A fixture with `.from(tableVar)` fails as dynamic.
- **AC-3 [static] The patch tool is keys-only.**
  - **Given** a fake live config with 120 keys including sentinels, and `--add-to-list
    uri_allow_list=https://*.workoutlab-web.pages.dev/**`, **when** it runs with `--apply` and
    the right `CONFIRM_PROD_AUTH`, **then** exactly one PATCH is sent. Its JSON body has
    exactly one key, `uri_allow_list`, whose value is the live list plus the new entry, comma
    joined, with live order kept.
  - **And** without `--apply`, or with a wrong `CONFIRM_PROD_AUTH`, **then** zero non-GET
    calls are made.
  - **And** no sentinel appears in stdout or stderr. That includes `--set-from-env` with a
    sentinel value, which shows as `<set>`.
  - **And** `others_sha256` is the same before and after, when the fake server changes only the
    patched key, and differs (exit 1) when it also changes another key.
- **AC-4 [live, local + human-run prod] Fingerprints are equal, and anon sees nothing on prod.**
  - The builder runs `rls-fingerprint.sh DB_URL` on local after `db reset`. The human runs
    `rls-fingerprint.sh PROD_DB_URL`. Both `lines=<n> sha256=<hex>` lines go in the log, and
    they are **equal**.
  - **And** an agent GETs `<VITE_SUPABASE_URL>/rest/v1/<t>?select=*&limit=1` with only the anon
    key, for each of the 7 owned tables and `session_sets_live`. Each returns `[]` (or a 401
    or 403 permission error, recorded). None returns rows.
  - **This AC must be green before AC-5 runs.**
- **AC-5 [live, human-run] The allow-list change, keys-only.**
  - **Given** AC-1 to AC-4 green, the builder runs `auth-patch.mjs --add-to-list
    uri_allow_list=https://*.workoutlab-web.pages.dev/**` **without** `--apply` (a read-only
    GET). The before/after and `others_sha256` go in the log. That's the review material,
    raised as an H-item by the orchestrator.
  - **When** the human runs the same command with `--apply` and `CONFIRM_PROD_AUTH=<ref>`,
    **then** the printed after-view equals the reviewed after-view, and `others_sha256` is
    unchanged.
- **AC-6 [live, read-only] Drift check agrees.**
  - **Before** the human's apply, with the updated expected file, the T-0500 check exits 1, with
    exactly one difference: `uri_allow_list: missing [https://*.workoutlab-web.pages.dev/**]`.
  - **After** the apply, it exits 0.
- **AC-7 [live, human] A tester signs in on a preview and sees only their own data (UF-01.5).**
  - **Given** the newest preview alias from T-0402a, **when** the human requests a magic link
    there with their own email and opens it, **then** they land signed in on **the preview
    origin**, not `localhost:3000`.
  - **And** after logging one set, the preview's Today/Balance shows only their rows.
  - Recorded by the orchestrator from the human's report. The built-in mailer's limit of 2 mails
    an hour is enough for this.

## Paths you may change
- `infra/scripts/rls-fingerprint.sql`, `infra/scripts/rls-fingerprint.sh`,
  `infra/scripts/auth-patch.mjs` (new), `infra/auth/expected-auth.json`, `infra/deploy/README.md`.
- `.github/scripts/rls-coverage.test.mjs`, `.github/scripts/auth-patch.test.mjs`,
  `.github/scripts/fixtures/rls-coverage/**`, `.github/scripts/fixtures/auth-patch/**` (new).
- **Listed extras:**
  - `supabase/tests/database/015_rls_every_table.test.sql` (new; lane `backend` path, granted to
    this ticket, test only, no migration).
  - `docs/tickets/T-0402c-rls-proof-and-preview-allow-list.md`, for the build and accept logs.

## Contract impact
None. No migration or policy change. A prod auth setting changes (`uri_allow_list`) through
D-0185 §4, with the expected file updated in the same ticket. No cost.

## Definition of done
- **Gate (D-0185 §4, D-0186 §2):**
  - **Run A:** the builder delivers the proof files, scripts and tests, the local fingerprint,
    the anon probes, and the no-apply PATCH preview. It commits and hands back `blocked`:
    "human: run the prod fingerprint; if equal, approve and run the PATCH".
  - The human runs both prod commands.
  - **Verify run:** AC-4's comparison, AC-6 after the apply, and AC-7.
  - The PATCH is never run by an agent, and never before AC-4 is green.
- Every `[static]` AC passes, and the planted faults are recorded.
- While you work: `node --test .github/scripts/rls-coverage.test.mjs
  .github/scripts/auth-patch.test.mjs`, then `supabase test db` on local Docker
  (`npx -y supabase@latest start -x vector,logflare`).
- Before handing back: `npx -y pnpm@10.28.2 -w test:repo-checks`, `-w format:check` and
  `node .github/scripts/check-all.mjs` pass.
- Nothing under `apps/` or `packages/` changes, so the `-w typecheck lint test` gate and e2e
  aren't needed (D-0178).
- Commits start `T-0402c` and cite UF-01.5.

## Notes
- **H-item for the orchestrator at run A's handback:** "T-0402c: run `bash
  infra/scripts/rls-fingerprint.sh PROD_DB_URL` and paste the line. If it equals the local line
  in the ticket log, review the before/after and run `CONFIRM_PROD_AUTH=<ref> node
  infra/scripts/auth-patch.mjs --add-to-list uri_allow_list=https://*.workoutlab-web.pages.dev/**
  --apply`."
- **Parallel:** waits on T-0402a, T-0402b and T-0500. It edits T-0500's expected file and
  T-0402a's README after both have merged.
- **Unblocks:** T-0402d, and T-0404b, which reuses `auth-patch.mjs`.

## Build / accept log
Archived in `docs/tickets/log/T-0402c.md` (D-0157).
