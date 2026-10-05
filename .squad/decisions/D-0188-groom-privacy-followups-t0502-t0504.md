---
id: D-0188
title: "Groom the T-0406 privacy follow-ups (T-0502, T-0503, T-0504) against main ccbae43: deletion purges the user's auth.audit_log_entries with an AFTER DELETE trigger on auth.users (not in the account function); Google name/avatar are stripped by BEFORE INSERT/UPDATE triggers on auth.users and auth.identities (not disclosed as stored); the notice gets the GDPR Art. 13 items with marked placeholders for unknown facts and a human re-approval (H-22); the two migrations are sequenced and ship in a second human-run prod release (H-23)"
status: revisit
date: 2026-10-05
by: product-owner (groom)
area: product
builds-on: D-0011, D-0017, D-0020, D-0030, D-0046, D-0135, D-0185, D-0186
amends: D-0135, D-0046
---
## Context
The T-0406 privacy review (`docs/security/privacy.md`) left three medium findings to fix before
H-06:
- **P5-a.** Supabase Auth writes `auth.audit_log_entries` rows (actor email, IP) that have no FK
  to `auth.users`. They survive the account-deletion cascade.
- **P2-a.** "Continue with Google" stores the user's name and avatar URL in
  `auth.users.raw_user_meta_data` and `auth.identities.identity_data`. The app never reads them
  (no `user_metadata`, `full_name` or `avatar_url` anywhere in `apps/web/src`,
  `supabase/functions` or `packages/shared/src`).
- **P6-a.** The notice lacks the GDPR Art. 13 items.

Constraints:
- D-0135 §3 fences the service-role key to `supabase/functions/account/admin.ts`. That file may
  make no `.from(`, `.rpc(`, `.schema(` or `.storage` call, and a static test enforces it.
- The service-role supabase-js client goes through PostgREST, which doesn't expose the `auth`
  schema. So "delete the audit rows from the function" would mean breaking the fence, exposing
  `auth`, or adding a second privileged DB connection.
- D-0135 "Revisit when" already expects this case: per-user data outside the cascade.
- Prod has had one release (H-19 done, 4 migrations). Any new migration is a second human-run
  release through `infra/scripts/supabase-prod-release.sh` (T-0402b, D-0186 §2).

## Decision
1. **T-0503 (P5-a): purge in the database, in the same transaction as the auth delete.**
   - A migration adds `private.purge_auth_audit_for_user()` and an `AFTER DELETE` trigger on
     `auth.users`. It deletes the `auth.audit_log_entries` rows whose `payload` names the deleted
     user by an **exact key match**: `actor_id` or `traits.user_id` equals the id, or
     `actor_username` or `traits.user_email` equals the email. Never a substring match, which
     could hit another user's rows.
   - `account/admin.ts` and the D-0135 §3 fence stay unchanged. Every delete path is covered:
     the `account` function, the dashboard and SQL.
   - GoTrue fires the trigger as `supabase_auth_admin`. The migration grants that role what it
     needs (usage on `private` and execute on the function), and the builder picks
     `security definer` or `invoker` so that both the GoTrue path and a `postgres` delete work.
   - If GoTrue's own `user_deleted` entry is written after the row is gone, the same migration
     may add a `BEFORE INSERT` trigger on `auth.audit_log_entries` that removes `user_email` and
     `user_phone` from that entry's `traits`. The ACs judge the outcome, not the mechanism.
   - **Fallback, only if neither works on the local stack** (permission denied, or the email
     still survives): the builder returns `needs-triage`, and the alternative is to turn off
     Postgres audit logging in prod. That is a prod auth setting. It goes through D-0185 §4 (the
     human, in the dashboard or by a reviewed keys-only PATCH, with the before/after in the log)
     and gets its own infra ticket that also extends `infra/auth/expected-auth.json` once T-0404b
     is done. It isn't pre-built here.
   - This amends D-0135 §5 ("no data-model change"): `docs/data-model.md` gains an
     **"Auth schema triggers"** section that names this trigger.
2. **T-0504 (P2-a): strip, don't disclose as stored.**
   - NFR-PRIV-2 says we collect email, training data and plan settings only. Disclosing name and
     avatar as stored would change the requirement instead of meeting it. Nothing uses the
     fields, so stripping them costs nothing.
   - The "minimal claims" route isn't available. Supabase's Google provider always requests
     `email profile`, and `signInWithOAuth`'s `scopes` can only add to that.
   - So a migration adds `BEFORE INSERT OR UPDATE` triggers on `auth.users`
     (`raw_user_meta_data`) and `auth.identities` (`identity_data`). They remove the profile keys
     `name`, `full_name`, `avatar_url`, `picture`, `given_name`, `family_name`, `nickname`,
     `preferred_username` and `custom_claims`.
   - The triggers keep `sub`, `iss`, `email`, `email_verified`, `phone_verified` and
     `provider_id`. GoTrue uses those, and `auth.identities.email` is generated from
     `identity_data->>'email'`.
   - This is a deny-list, not an allow-list, so GoTrue's other internal keys keep working.
   - The notice (T-0502) says that Google sends us your name and picture, and that we drop them
     as you sign in.
   - `docs/data-model.md`'s "Auth schema triggers" section names these triggers too.
3. **Sequencing.** T-0503 (lane backend, migration as a listed extra) and T-0504 (lane data) both
   add a migration and edit `docs/data-model.md`. Their paths overlap (`supabase/migrations/**`,
   `supabase/tests/**`, `docs/data-model.md`), so they can't run in parallel. T-0503 goes first,
   because it fixes a false "deleted straight away". T-0504 depends on it. Neither touches
   `infra/**` or `supabase/config.toml`, so neither overlaps T-0404b.
4. **H-23: second prod release.** Once T-0503 and T-0504 are merged, the human runs
   `infra/scripts/supabase-prod-release.sh` (plan, then apply) for the two new migrations. They
   then sign in once with Google in prod and check read-only that the user's metadata holds no
   name or picture. T-0403 (release check) and H-06 wait for H-23. Until H-23 is done, the two
   fixes are true locally and in CI only.
5. **T-0502 (P6-a): notice v2.**
   - The notice gets these sections, in order: `who-we-are`, `what-we-store`, `why`, `where`,
     `how-long`, `export-and-delete`, `your-rights`, `no-tracking`, `contact`.
   - They add the controller, the legal basis per purpose (Art. 6(1)(b) and 6(1)(f)), the
     processors and where they run (Supabase in Ireland, Resend in the EU region, Cloudflare at
     the global edge, Google only with Google sign-in), retention (account lifetime, backups up
     to 7 days, platform logs up to 7 days, sign-in session data), the rights, the right to
     complain, and the in-app path "Plan → Account".
   - **No invented facts.** Facts the repo doesn't hold appear as exact markers
     `{{HUMAN:CONTROLLER_NAME}}`, `{{HUMAN:CONTROLLER_ADDRESS}}` and
     `{{HUMAN:SUPERVISORY_AUTHORITY}}`, and a test pins that set.
   - New human gate **H-22**, in the style of H-10: the human supplies those three facts,
     confirms the legal bases, confirms that training logs aren't Art. 9 health data (or says
     otherwise), and re-approves the whole copy.
   - T-0502 can be **built** now, but is **done** only after the fill-in pass, when the pinned
     set is empty. That pass needs H-22 and H-21 (DPAs).
   - This amends D-0046 §8 ("make no new promises"): the Art. 13 disclosures are allowed, as
     long as each one is true of the system. The Google sentence and the audit-log retention
     sentence become true at H-23.

## Consequences
- Board: T-0502 `ready` (done needs H-21 and H-22), T-0503 `ready`, T-0504 `todo` (dep T-0503).
- Orchestrator: add H-22 and H-23 to `needs-human.md`, add H-23 as a dep note on T-0403, and
  have T-0403 check that no `{{HUMAN:` marker remains in `apps/landing/src/content/`.
- Security reviewer: re-check P2-a, P5-a and P6-a in `docs/security/privacy.md` after H-23.

## Revisit when
- Supabase blocks triggers on `auth` tables for the `postgres` role. Then use the §1 fallback for
  P5-a, and disclosure for P2-a.
- GoTrue adds an option to stop storing provider profile claims.
- The human (H-22) says Art. 9 applies. Then the legal-basis section needs explicit consent, and
  that's a product change.
