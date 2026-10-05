# Privacy requirements (NFR-PRIV-1…7): evidence and verdicts

Ticket T-0406. Reviewed 2026-10-05 on `main` at `91df46f`, by the security reviewer.
This review used repo evidence and ticket logs only. It made no calls to any real account.
The release check (T-0403) relies on this file. Its verdict wins over the comment in
`apps/landing/src/content/privacy.ts` that says "if the security review text differs, that
text wins".

Source of every requirement: `docs/specs/non-functional.md` lines 60–66 (D-0017).
UF-11.4 cites NFR-PRIV-4 and NFR-PRIV-5 in `Design-docs/docs/product/user-flows.md:113`.

## Summary

| ID | Requirement (short) | Verdict | Highest open finding |
| --- | --- | --- | --- |
| NFR-PRIV-1 | Data hosted in an EU region | **met** | low: the spec names a different default region; no automated check pins it |
| NFR-PRIV-2 | Data minimisation | **partly met** | medium: Google sign-in stores name and avatar in `auth.users` |
| NFR-PRIV-3 | RLS owner isolation | **met** | none |
| NFR-PRIV-4 | In-app JSON export, < 10 s for 2 years | **met** | low: no check that the export's table list keeps up with the schema |
| NFR-PRIV-5 | In-app deletion, cascade, local wipe | **partly met** | medium: auth audit log and backups outlive deletion; prod not deployed yet (H-19/H-14) |
| NFR-PRIV-6 | Privacy notice from UF-01.5 and landing | **partly met** | medium: the notice lacks the GDPR Art. 13 items (processors, legal basis, retention, rights) |
| NFR-PRIV-7 | No credentials or PII in logs | **met** | low: one browser `console.warn` carries a session id |

No finding is high or critical. The two release preconditions at the end of this file are
already tracked elsewhere (H-19/T-0402b, H-14). They aren't new findings, but go-live has to
wait for them.

Severity scale: **high** means a promise to users is false in production, or personal data
reaches someone it shouldn't. **Medium** means a legal or completeness gap with a cheap fix
that should land before H-06. **Low** means hardening or drift protection.

---

## NFR-PRIV-1 — EU region

> Data is hosted in an EU region (default Supabase `eu-north-1` Stockholm, else
> `eu-central-1`). Test: Terraform plan asserts the region. Ticket: T-0400.

**Implemented**
- Prod Supabase project `csgjsdwuxqtuqpuazzpz` is pinned to `region = "eu-west-1"` (Ireland)
  in `infra/terraform/supabase-prod/main.tf:31`. The module is
  `infra/terraform/modules/supabase_project/main.tf:26-36` with `prevent_destroy`, so a region
  change would be a replace, and Terraform refuses it.
- T-0400 discovery (`docs/tickets/log/T-0400.md:9`, read-only GET) found region `eu-west-1`,
  `ACTIVE_HEALTHY`. Run B imported it with **zero changes** (`docs/tickets/log/T-0400.md:342-351`).
  That proves the live region equals the pinned one.
- Transactional email (sign-in codes) goes through Resend. Its domain was created in region
  **eu-west-1** (H-20 done, `.squad/needs-human.md:24`, `docs/tickets/T-0404a-resend-dns-records.md:147`;
  the MX feedback host is `feedback-smtp.eu-west-1.amazonses.com`).
- **Cloudflare Pages** serves `apps/web` and `apps/landing` as static assets from Cloudflare's
  global edge. No user data is stored there:
  - No Pages Functions or Workers. `infra/terraform/cloudflare/main.tf` declares only
    `cloudflare_pages_project`, `cloudflare_pages_domain` and `cloudflare_dns_record`.
  - The service worker precaches build assets only, with no `runtimeCaching`
    (`apps/web/vite.config.ts:81-83`). API responses never land in Cache Storage.
  - The CSP `connect-src` is the Supabase URL only (`apps/web/vite.config.ts:28`). Training data
    goes browser → Supabase directly and never through Pages.
  - What the edge does see: client IP, user agent, and the requested URL. That includes the
    one-time PKCE `?code=` on `/auth/callback` (`apps/web/src/lib/auth/client.ts:101`,
    `flowType: "pkce"`). That code is useless without the verifier, which never leaves the
    device. Pages request logs aren't exported: no Logpush is configured in the repo, and Pages
    Web Analytics isn't enabled in Terraform.
  - Supabase's own API edge is run by Supabase's sub-processors and falls under Supabase's DPA.
    The repo can't verify it.

**Proof**
- T-0400 run B: zero-change plan and apply against the live project (log above).
- No automated test in the repo asserts the region literal. `grep -r eu-west-1` finds only the
  `.tf` file, the T-0400 log, and the H-20 and D-0186 notes.

**Verdict: met.** Ireland is an EU region.

**Findings**
- **P1-a (low)** The spec says "default `eu-north-1`, else `eu-central-1`". The live project is
  in `eu-west-1`, and no decision records that choice. The data is still in the EU, so this is
  a spec mismatch, not a breach. Follow-up: *"NFR-PRIV-1: record eu-west-1 as the prod region
  (decision + spec wording)"*, lane **product**.
- **P1-b (low)** "Terraform plan asserts the region" holds only when someone runs a plan.
  Follow-up: *"Static test: supabase-prod region literal is an `eu-*` region"* (a node test over
  `infra/terraform/supabase-prod/main.tf`), lane **infra**.

---

## NFR-PRIV-2 — Data minimisation

> We collect email, training data and plan settings only. No DOB, sex, body weight, heart rate
> or location coordinates (`sessions.location` is a label). Test: schema review in T-0100, plus
> a security review.

**Implemented**
- The data model puts email only in `auth.users`; there's no `public.users`
  (`docs/data-model.md:8`).
- User-owned tables and their columns: `supabase/migrations/20260927210000_data_model_v1a.sql`
  (`profiles` :60, `area_targets` :126, `sessions` :152, `session_sets` :170) and
  `supabase/migrations/20260928090000_data_model_v1b.sql` (`routines` :54, `routine_items` :84,
  `plan_checkins` :107).
- `sessions.location` is free text capped at 32 characters
  (`20260927210000_data_model_v1a.sql:159`).
- `session_sets.weight_kg` is the load lifted, not body weight. `profiles.onboarding_timing_ms`
  is disclosed in the notice.
- The `analytics` schema (`20260928090000_data_model_v1b.sql:176-260`) holds aggregate views only,
  with no per-user output. `anon` and `authenticated` are revoked from it (:177).
- The web app loads no third-party scripts, fonts or trackers. The CSP is
  `default-src 'self'; script-src 'self'` (`apps/web/vite.config.ts:28`), and a grep for
  sentry/plausible/gtag/posthog/googleapis in `apps/web` and `apps/landing` finds nothing.

**Proof**
- pgTAP `supabase/tests/database/001_schema.test.sql:300-306` (T-0100 AC23): zero columns in
  `public` or `analytics` match
  `dob|birth|sex|gender|body_?weight|heart|latitude|longitude|lat|lng|coord|email`.
- `columns_are` for every table in the same file (for example :135 for `session_sets`): the
  exact column set, so a new column fails the test until the data model changes.

**Verdict: partly met.** The app schema is minimal and pinned by tests. The auth schema isn't.

**Findings**
- **P2-a (medium)** "Continue with Google" (`apps/web/src/features/UF-01/AccountScreen.tsx:97-100`)
  uses Supabase's Google provider. That provider always requests the `email profile` scopes.
  The user's **full name and avatar URL** (plus Google `sub`) are then stored in
  `auth.users.raw_user_meta_data` and `auth.identities.identity_data`. The app never reads them
  (no use of `user_metadata`, `full_name` or `avatar` in `apps/web/src`). The notice says we
  store "your email address". AC23 can't see this, because it checks only `public` and
  `analytics`.
  Follow-ups:
  - *"Strip Google profile fields (name, avatar) from auth.users / identities on sign-in, with a
    pgTAP test"*, lane **data**. Possible approach: a trigger on `auth.users` that nulls those
    keys. If Supabase forbids that, disclose the fields instead (next follow-up).
  - *"Privacy notice: say that Google sign-in passes your name and profile picture to us via
    Supabase Auth, and that we don't use them"* (or remove the sentence once they're stripped),
    lane **design** (owns `apps/landing/src/content/**`).
- **P2-b (low)** Supabase Auth also stores the IP address and user agent per session and refresh
  token (`auth.sessions`), plus `last_sign_in_at`. That's normal for sign-in and security, but
  the notice doesn't mention it. It's folded into the notice follow-up under NFR-PRIV-6 (P6-a).

---

## NFR-PRIV-3 — RLS: own rows only; library read-only

**Implemented**
- RLS is on for all 7 user tables, with `select/insert/update/delete` policies scoped to
  `auth.uid() = user_id`:
  - `20260927210000_data_model_v1a.sql:253-291`: profiles, area_targets, sessions, session_sets.
  - `20260928090000_data_model_v1b.sql:140-168`: routines, routine_items, plan_checkins.
- The library tables (`areas`, `exercises`, `exercise_areas`, `exercise_variants`) have RLS on,
  with a `select`-only policy for `anon` and `authenticated`, and no write grants
  (`20260927210000_data_model_v1a.sql:229-241`).
- `session_sets_live` is `security_invoker = true` (v1a :218-219, v1b :35-36), so it inherits
  the RLS of `session_sets`.
- Composite FKs `(session_id, user_id)` and `(routine_id, user_id)` stop a user attaching rows to
  another user's parent (v1a :189, v1b :97).

**Proof**
- pgTAP `supabase/tests/database/002_rls_owner.test.sql` (plan 53, T-0100 AC4/AC5/AC7). It
  covers all 7 tables: user B selects, updates and deletes 0 of A's rows, `anon` sees no owned
  rows, and cross-user attach is refused.
- pgTAP `003_library.test.sql:17-21+` (AC6): `anon` reads the library and can't write it.
- `001_schema.test.sql:289,295`: the composite `fk_ok` checks.
- CI runs `supabase test db` (`.github/workflows/ci.yml:120`).

**Verdict: met.** No findings.

---

## NFR-PRIV-4 — Export: one JSON file, every owned row, < 10 s for 2 years

**Implemented**
- `apps/web/src/lib/account/export.ts`:
  - `EXPORT_TABLES` (:16-24) lists all 7 user-owned tables: profiles, area_targets, sessions,
    session_sets, routines, routine_items, plan_checkins. That matches every table with a
    `user_id → auth.users` FK in `supabase/migrations/` (the list is under NFR-PRIV-5).
  - Paged reads (`PAGE_SIZE = 1000`, `.order().range()`) get past PostgREST `max_rows`.
  - Tombstoned sets are included.
  - The `device` section adds this user's queued, unsent sessions and sets from Dexie.
  - `account` carries `userId` and `email`.
  - All or nothing: any error rejects `export_failed`, so the user never gets a partial file.
- `apps/web/src/lib/account/download.ts`: a single file download. The UF-11.4 screen comes from
  T-0310d.

**Proof**
- vitest `apps/web/src/lib/account/__tests__/export.test.ts`:
  - AC1: 5,000 sets read in six ranges, tombstones included, with a real `max_rows` fake.
  - AC2: top-level shape and exactly the 7 tables.
  - AC3: device section holds only U's rows.
  - AC4: all or nothing.
  - **AC5: 5,000 sets at 25 ms per request, export + stringify < 10,000 ms.**
  - L1: shared device.
- e2e `tests/e2e/uf-11-account.spec.ts:123-190` (T-0469 AC-1): `Export my data` downloads one
  `workoutlab-export` file with the 7 tables.

**Verdict: met.**

**Findings**
- **P4-a (low)** No test ties `EXPORT_TABLES` to the schema. The comparison list
  `EXPORT_TABLE_NAMES` in `__tests__/fixtures.ts:207` is hand-written, so an 8th user-owned table
  could ship without being exported. Follow-up: *"Drift guard: every public table with a
  `user_id` FK to auth.users is in EXPORT_TABLES and has ON DELETE CASCADE"*. Generate the list
  from `packages/shared` `Database` types, or have a pgTAP test over `pg_constraint` emit it.
  Lane **backend** (pgTAP half) plus **web-shell** (vitest half).
- **P4-b (low)** The export holds `userId` and `email` but not the auth-side data Supabase keeps
  about the user: Google name and avatar (P2-a), sign-in timestamps. If P2-a's strip lands, this
  shrinks to timestamps. Covered by P2-a. No separate ticket.

---

## NFR-PRIV-5 — Account deletion: auth user + all rows, immediately; local data cleared

**Implemented**

Server side:
- Every user-owned table has `user_id … references auth.users (id) on delete cascade`. All 7
  are covered, and there are no others:

  | Table | Migration:line |
  | --- | --- |
  | profiles | `20260927210000_data_model_v1a.sql:61` |
  | area_targets | v1a :127 |
  | sessions | v1a :154 |
  | session_sets | v1a :172, plus cascade via sessions :189 |
  | routines | `20260928090000_data_model_v1b.sql:56` |
  | routine_items | v1b :87, plus cascade via routines :97 |
  | plan_checkins | v1b :109 |

  The library tables have no `user_id`. The `analytics` views hold no rows.
- `DELETE /account` Edge Function: `supabase/functions/account/admin.ts:22` calls
  `admin.auth.admin.deleteUser(userId, false)`. That's a **hard** delete
  (`shouldSoftDelete = false`) of the JWT's own user. Per D-0135, this is the only file that
  reads the service-role key. `.github/scripts/check-deploy-workflow.mjs:16` guards
  `service_role` out of the deploy workflow.

Client side (`apps/web/src/lib/account/delete.ts`, `wipe.ts`):
- Deletion first checks that the session user is the target user. Only a 204 starts the wipe.
- `wipeLocalUserData` deletes this user's rows in **one** Dexie `rw` transaction over every
  table of `offlineDb()`. That's all 11 stores (`apps/web/src/lib/offline/db.ts:186-205`),
  queue included. Other users' rows on the device are left alone (NFR-OFF-4).
- It removes every `wl-` key from localStorage and sessionStorage.
- It then calls `signOut({scope:"local"})`. If that fails, it removes `sb-*-auth-token`
  (+ code verifier) itself (`delete.ts:77-92`).
- The Workbox precache holds build assets only (no runtime caching), so nothing user-related
  stays behind.

**Proof**
- pgTAP `supabase/tests/database/007_account_deletion.test.sql` (T-0100 AC22, plan 11): deleting
  A from `auth.users` leaves 0 rows in all 7 tables, tombstones included. B's rows remain.
- Deno integration `supabase/tests/functions/integration/account-delete.test.ts`:
  - T-0310b AC8: the real stack removes A's auth user and every owned row, B is untouched, and a
    repeat call is 401.
  - AC9: a user with no rows is deleted.
  - **AC10: 400 sessions over 730 days and 5,000 sets are deleted within 10 s.**
  - CI runs these at `.github/workflows/ci.yml:130`.
- vitest `apps/web/src/lib/account/__tests__/wipe.test.ts` (T-0310c AC8):
  - the table list is exactly the 11 Dexie tables, so a new table fails the test;
  - U's rows and `wl-` keys go, V's stay;
  - one transaction;
  - a rollback on failure still clears the keys.
- vitest `__tests__/delete.test.ts`: the order (delete → wipe → flag → sign-out), and no wipe on
  non-204.
- e2e `tests/e2e/uf-11-account.spec.ts:192-358` (T-0469):
  - AC-2: deletes only this user's device data and lands on `/welcome` with the notice;
  - AC-3: a 500 keeps everything;
  - AC-4: offline disables the action.

  The e2e mocks the HTTP function. The server half is proven by the pgTAP and Deno tests above.

**Verdict: partly met.** The app-owned data, the auth user and the device are fully covered and
tested. Two kinds of residual personal data outlive "deleted straight away", and production
isn't deployed yet.

**Findings**
- **P5-a (medium)** Supabase Auth writes `auth.audit_log_entries` rows on sign-up, sign-in and
  delete. Their `payload` includes the actor's email and IP. The table has **no FK** to
  `auth.users`, so the cascade doesn't reach it. Unless Postgres audit logging is off,
  the deleted user's email stays in the prod database. `auth.flow_state` (PKCE, may hold provider
  tokens) has no cascade either; GoTrue expires those rows. This review couldn't check the prod
  setting (read-only, no account calls). Follow-up: *"Account deletion also purges the user's
  auth.audit_log_entries (or turn off Postgres audit logging) + Deno integration assertion"*,
  lane **backend**. The pgTAP/Deno test should assert that no `audit_log_entries.payload`
  contains the deleted email.
- **P5-b (medium)** Supabase backups keep deleted data until they rotate: daily backups,
  retained 7 days on Pro, which go-live switches to at T-0402d. The platform logs (P7-b) do too.
  That's normal and acceptable, but the notice promises deletion "straight away" without saying
  so. Folded into P6-a (state the backup and log retention).
- **P5-c (precondition, tracked)** Prod has never had a migration pushed (H-19/T-0402b). The
  `account` function needs `SUPABASE_SERVICE_ROLE_KEY` in prod (H-14, folded into H-19). Until
  both are done, in-app deletion **doesn't work in production**, and export finds no tables. See
  the release preconditions at the end of this file.

---

## NFR-PRIV-6 — Privacy notice linked from UF-01.5 and the landing page

> Covers what we store, why, where, and how to export or delete it. Test: content review
> before H-06.

**Implemented**
- Copy: `apps/landing/src/content/privacy.ts`. It has the sections what-we-store, why, where,
  export-and-delete, no-tracking and contact, with `privacy@workout.vestgote.com`.
- Rendered at `/privacy/` by `apps/landing/src/pages/privacy.astro`.
- Linked from the landing page body and footer (`apps/landing/src/pages/index.astro:44,51`).
- UF-01.5 links to `https://workout.vestgote.com/privacy/`
  (`apps/web/src/features/UF-01/AccountScreen.tsx:16`, rendered :237).
- H-10 is done: the human approved the copy, and the mailbox exists.

**Proof**
- vitest `apps/landing/src/content/content.test.ts`: T-0309 AC5 regexes for email, training,
  plan settings, the not-collected list, `\bEU\b`, JSON and delete; the landing summary
  (:90); the mailbox (:146).
- `apps/landing/test/ac14-privacy-page.test.ts`: T-0309 AC14, the built page.
- vitest `apps/web/src/features/UF-01/__tests__/account.test.tsx:148`: the UF-01.5 link URL.

**Verdict: partly met.** The four topics the NFR names are covered and tested. For EU users and
health-adjacent data, though, the notice is missing the items GDPR Art. 13 requires at
collection, and two claims are incomplete.

**Findings**
- **P6-a (medium)** Add these to the notice (follow-up: *"Privacy notice: GDPR Art. 13
  completeness (controller, legal basis, processors, retention, rights)"*, lane **design**;
  copy change, needs the human's re-approval as H-10 did):
  1. **Controller** identity and contact. The page byline says "by Uptive", but the notice
     doesn't name the controller or an address.
  2. **Legal basis**: contract (Art. 6(1)(b)) for the account and training data, and legitimate
     interest for the aggregate metrics.
  3. **Processors and where they run**:
     - Supabase: database and auth, EU (Ireland).
     - Resend: sign-in emails, EU region, US company.
     - Cloudflare: hosting, global edge, sees IP and URL.
     - Google: only if you choose "Continue with Google"; Google learns you signed in, and we
       receive your name and picture (P2-a).

     "The app talks only to our own servers and our database provider" is true for data calls,
     but it leaves out the Google redirect and the email provider.
  4. **Retention**:
     - data is kept until you delete the account;
     - backups up to 7 days (P5-b);
     - platform logs with IP and user id for 1–7 days (P7-b);
     - auth session metadata, IP and user agent (P2-b).
  5. **Rights**: access, rectification, erasure, portability, objection, and the right to
     complain to a supervisory authority (for example IMY in Sweden).
  6. **Where to find export and delete**: "Plan → Account" (open follow-up from T-0310d,
     `docs/tickets/T-0310d-uf11-account-settings-screen.md:131`).
- **P6-b (low)** `privacy.ts:8` still says "The contact mailbox is pending human gate H-10", and
  `updated: "2026-09-28"` will need a bump with P6-a. Folded into P6-a.

---

## NFR-PRIV-7 — No credentials or PII in logs; functions log request IDs, not emails

**Implemented**
- Edge Functions: the only log call is `supabase/functions/_shared/http.ts:30-33`. It writes one
  JSON line per request, `{requestId, fn, status, ms}`, called once from `createHandler` (:102).
- Unexpected errors map to `internalError()` without logging the error or stack (:96-100).
- `account/admin.ts:11` documents that its thrown messages carry no user id.
- A grep of `supabase/functions/**` for `console.*` finds nothing else.
- Web app (`apps/web/src`, non-test). Three `console.warn` calls, and no `console.log` or
  `console.error`:
  - `lib/auth/client.ts:40`: a fixed "unconfigured" message.
  - `lib/pwa/register.ts:27`: the service-worker registration error object, which holds no PII.
  - `features/UF-09/load.ts:54-56`: the **session id** and the parser error. It deliberately
    leaves out the plan contents and the user id (D-0138).

  These print only in the user's own browser console. No remote error reporting exists.
- Landing (`apps/landing/src`): no logging.
- CI and deploy (`.github/workflows/ci.yml`, `deploy.yml`):
  - `ci.yml:100` appends `supabase status -o env` to `$GITHUB_ENV` without printing it. These
    are the keys of the local, throwaway CI stack.
  - `deploy.yml` passes `CLOUDFLARE_API_TOKEN` from `secrets.*` via `env` only.
  - `tee`'d wrangler output holds deploy URLs only, and the step summary prints only the alias
    URLs (:78-80).
  - No emails or user ids appear anywhere in the workflows.
- Infra scripts (`infra/scripts/auth-drift-check.mjs`, `cost-check.mjs`) filter API responses to
  allow-listed keys before printing (T-0500, T-0405).

**Proof**
- Deno unit `supabase/tests/functions/unit/platform.test.ts:110,129,169` (T-0203 AC23): one JSON
  log line shaped `{requestId, fn, status, ms}` with no email or user id; a 500 body has no stack
  or email; `internalError()` never carries an email.
- Deno unit `supabase/tests/functions/unit/account.test.ts:292` (T-0310b AC7): the account
  function's log line has exactly those keys and doesn't contain the user id or email.
- Deno integration `supabase/tests/functions/integration/workouts-balance.test.ts:440-460`: a
  sweep over every error body in the suite finds no user id, test email or stack trace.

**Verdict: met.**

**Findings**
- **P7-a (low)** `apps/web/src/features/UF-09/load.ts:54-56` logs a session UUID in the
  browser console. It's a pseudonymous id, it stays on the user's own device, and it's useful
  for support. Accept it. No ticket, unless remote error reporting is ever added. Then this line
  must be revisited.
- **P7-b (low, out of our code)** Supabase platform logs keep request metadata outside our
  control, with short retention (1 day on Free, 7 days on Pro):
  - API gateway / edge logs: IP, path, and the JWT `sub`;
  - Auth logs: email.

  These are processor logs under Supabase's DPA. The only action is disclosure in the notice
  (folded into P6-a).

---

## Other open items the release check should see

These aren't privacy requirements. They're listed so T-0403 has one place to look.

- **H-19 / T-0402b (open)** The prod database has no migrations, seed or functions yet. It
  blocks NFR-PRIV-3/4/5 in production, because nothing exists there to protect, export or
  delete.
- **H-14 (open, folded into H-19)** The `account` function needs `SUPABASE_SERVICE_ROLE_KEY` in
  prod. It blocks in-app deletion in production (NFR-PRIV-5).
- **TR-0047 (open, auth)** Prod sends **8-digit** sign-in codes, but the app accepts 6
  (`.squad/triage/TR-0047-t0500-prod-mailer-otp-length-8.md`; expected value
  `mailer_otp_length: 6` in `infra/auth/expected-auth.json`). Email sign-in fails in prod until
  this is fixed. It isn't a privacy issue, but it blocks the export and delete paths for every
  email user.
- Prod `site_url` is still `http://localhost:3000` (T-0400 log :9). T-0402d switches it at
  go-live. Auth, not privacy.
- DPAs: confirm that the Supabase and Resend DPAs (with SCCs, since both are US companies) are
  accepted for the Uptive account. The repo can't verify this. Human item, raised as a
  follow-up for the **orchestrator** to add to `needs-human.md`.

## Release preconditions (for T-0403 go/no-go)

1. H-19/T-0402b applied, and H-14 confirmed. Without them, NFR-PRIV-4/5 don't work in prod.
2. TR-0047 resolved. Without it, email users can't sign in, so they can't reach export or
   delete.
3. Recommended before H-06, but not a hard block: P6-a (notice completeness), P5-a (audit-log
   purge), P2-a (Google profile fields). All three are medium.

## Follow-ups

| ID | Title | Lane | Severity |
| --- | --- | --- | --- |
| P6-a | Privacy notice: GDPR Art. 13 completeness (controller, legal basis, processors incl. Resend/Cloudflare/Google, retention incl. backups and platform logs, rights, "Plan → Account" path) | design | medium |
| P5-a | Account deletion purges the user's `auth.audit_log_entries` (or turn off Postgres audit logging), with a Deno integration assertion | backend | medium |
| P2-a | Strip Google profile fields (name, avatar) from `auth.users` / `auth.identities`, with a pgTAP test; otherwise disclose them (P6-a) | data | medium |
| P4-a | Drift guard: every public table with a `user_id` FK to `auth.users` has ON DELETE CASCADE and is in `EXPORT_TABLES` | backend + web-shell | low |
| P1-a | Record eu-west-1 as the prod region (decision + NFR-PRIV-1 wording) | product | low |
| P1-b | Static test: the supabase-prod region literal is an `eu-*` region | infra | low |
| — | Confirm the Supabase and Resend DPAs/SCCs are accepted (human) | orchestrator | low |
