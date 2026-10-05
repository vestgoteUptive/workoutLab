-- T-0503 (UF-11.4, NFR-PRIV-5, D-0188 §1, amends D-0135 §5): deleting an auth user also deletes
-- that user's auth.audit_log_entries rows. GoTrue writes them on sign-up, sign-in and delete; the
-- payload holds the user's email and the row holds the IP. The table has no FK to auth.users, so
-- the D-0020 cascade never reaches it. This trigger runs in the same transaction as the delete,
-- whichever path deletes the user (the `account` function via the Auth admin API, the dashboard,
-- or SQL).
--
-- Match keys (exact equality only, never like/ilike or a payload::text match, so another user's
-- rows are never hit, e.g. `ba@test.local` when `a@test.local` is deleted):
--   payload->>'actor_id'              = old.id
--   payload->'traits'->>'user_id'     = old.id
--   payload->>'actor_username'        = old.email  (only when old.email is not null)
--   payload->'traits'->>'user_email'  = old.email  (only when old.email is not null)
-- `payload` is json, not jsonb; `->` / `->>` work on both.
--
-- Security: SECURITY INVOKER (the default), chosen over SECURITY DEFINER. The function runs with
-- the rights of whoever deletes the auth user: GoTrue connects as supabase_auth_admin, which owns
-- auth.audit_log_entries; `postgres` (pgTAP, SQL editor) holds DELETE on it. Both paths work
-- without lending anyone extra rights, and a role that may delete auth.users but not the audit
-- rows makes the whole delete fail and roll back, rather than leave the rows behind silently.
-- search_path is '' so every name below is schema-qualified.
--
-- Exposure: execute is revoked from public, anon and authenticated (they also have no usage on
-- `private`, see 015_rls_every_table.test.sql). supabase_auth_admin gets usage on `private` and
-- execute on the function, the role GoTrue fires the trigger as (D-0188 §1).
--
-- GoTrue's own `user_deleted` entry (traits.user_id / traits.user_email = the user) is written
-- inside the same transaction before the auth.users row is removed, so this trigger removes it
-- too (proved by the T-0503 AC-3 integration test); no BEFORE INSERT scrub is needed.

create function private.purge_auth_audit_for_user() returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  delete from auth.audit_log_entries e
   where e.payload->>'actor_id' = old.id::text
      or e.payload->'traits'->>'user_id' = old.id::text
      or (old.email is not null and e.payload->>'actor_username' = old.email)
      or (old.email is not null and e.payload->'traits'->>'user_email' = old.email);
  return old;
end;
$$;

revoke all on function private.purge_auth_audit_for_user() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.purge_auth_audit_for_user() to supabase_auth_admin;

create trigger auth_users_purge_audit
  after delete on auth.users
  for each row execute function private.purge_auth_audit_for_user();
