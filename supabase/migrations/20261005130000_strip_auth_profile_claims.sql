-- T-0504 (UF-01.5, NFR-PRIV-2, D-0188 §2, T-0406 finding P2-a): Google sign-in no longer stores
-- the user's name or avatar. Supabase's Google provider always asks for the `email profile`
-- scopes and GoTrue copies the profile claims into auth.users.raw_user_meta_data and
-- auth.identities.identity_data. Nothing in the app reads them, so BEFORE INSERT/UPDATE triggers
-- strip them, whatever the source (OAuth sign-in, admin createUser, updateUser({ data })).
--
-- Stripped keys (the only list, in private.strip_profile_claims):
--   name, full_name, avatar_url, picture, given_name, family_name, nickname, preferred_username,
--   custom_claims
-- Kept: sub, iss, email, email_verified, phone_verified, provider_id and any key not listed.
-- auth.identities.email is a generated column over identity_data->>'email', and GoTrue links
-- identities by provider_id and email, so both must stay.
--
-- A returning Google user: GoTrue rewrites both columns with fresh claims on each OAuth sign-in;
-- the update path strips them again.
--
-- Security: SECURITY INVOKER (the default). The trigger functions only rewrite NEW, so they need
-- no rights beyond the caller's. GoTrue writes as supabase_auth_admin, which gets usage on
-- `private` (also granted by T-0503; repeating a grant is a no-op) and execute on the three
-- functions the triggers call. No grant to anon or authenticated; execute is revoked from public.
-- search_path is '' so every name is schema-qualified.
--
-- Forward-only. Rollback, if Google sign-in breaks in prod: drop the two triggers in a follow-up
-- migration (D-0188 "Revisit when").

create function private.strip_profile_claims(j jsonb) returns jsonb
  language sql
  immutable
  strict
  set search_path = ''
as $$
  select j - array['name', 'full_name', 'avatar_url', 'picture', 'given_name', 'family_name',
                   'nickname', 'preferred_username', 'custom_claims'];
$$;

create function private.auth_users_strip_profile() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.raw_user_meta_data := private.strip_profile_claims(new.raw_user_meta_data);
  return new;
end;
$$;

create function private.auth_identities_strip_profile() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.identity_data := private.strip_profile_claims(new.identity_data);
  return new;
end;
$$;

-- One-off strip of the rows that exist before the triggers (prod has H-19's smoke-test users,
-- dev has Google users). Returns the number of rows changed; a second run returns 0.
create function private.strip_profile_claims_backfill() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  users_changed integer;
  identities_changed integer;
begin
  update auth.users u
     set raw_user_meta_data = private.strip_profile_claims(u.raw_user_meta_data)
   where u.raw_user_meta_data is distinct from private.strip_profile_claims(u.raw_user_meta_data);
  get diagnostics users_changed = row_count;

  update auth.identities i
     set identity_data = private.strip_profile_claims(i.identity_data)
   where i.identity_data is distinct from private.strip_profile_claims(i.identity_data);
  get diagnostics identities_changed = row_count;

  return users_changed + identities_changed;
end;
$$;

revoke all on function private.strip_profile_claims(jsonb) from public, anon, authenticated;
revoke all on function private.auth_users_strip_profile() from public, anon, authenticated;
revoke all on function private.auth_identities_strip_profile() from public, anon, authenticated;
revoke all on function private.strip_profile_claims_backfill() from public, anon, authenticated;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.strip_profile_claims(jsonb) to supabase_auth_admin;
grant execute on function private.auth_users_strip_profile() to supabase_auth_admin;
grant execute on function private.auth_identities_strip_profile() to supabase_auth_admin;

create trigger auth_users_strip_profile
  before insert or update of raw_user_meta_data on auth.users
  for each row execute function private.auth_users_strip_profile();

create trigger auth_identities_strip_profile
  before insert or update of identity_data on auth.identities
  for each row execute function private.auth_identities_strip_profile();

select private.strip_profile_claims_backfill();
