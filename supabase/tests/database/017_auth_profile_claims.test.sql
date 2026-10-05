-- T-0504 (UF-01.5, NFR-PRIV-2, D-0188 §2): provider profile claims (name, avatar, ...) are stripped
-- from auth.users.raw_user_meta_data and auth.identities.identity_data on insert and update, and
-- the backfill strips rows that predate the triggers. The keys GoTrue needs to sign in and link
-- (sub, iss, email, email_verified, phone_verified, provider_id) stay.
begin;
select plan(25);

-- G: a Google-shaped claim set. (The ticket's user id `…00g1` is not valid hex; `…00f1` is used.)
create temporary table g_claims as select
  '{"iss":"https://accounts.google.com","sub":"g-123","email":"g@test.local",
    "email_verified":true,"phone_verified":false,"provider_id":"g-123",
    "name":"Ada L","full_name":"Ada L","given_name":"Ada","family_name":"L",
    "avatar_url":"https://lh3.example/a.png","picture":"https://lh3.example/a.png",
    "custom_claims":{"hd":"example.com"}}'::jsonb as g,
  '{"iss":"https://accounts.google.com","sub":"g-123","email":"g@test.local",
    "email_verified":true,"phone_verified":false,"provider_id":"g-123"}'::jsonb as kept;

-- AC-1: insert path --------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data)
  select '00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'g@test.local', g
    from g_claims;
insert into auth.identities (provider_id, user_id, provider, identity_data)
  select 'g-123', '00000000-0000-0000-0000-0000000000f1', 'google', g from g_claims;

select is(
  (select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000000f1'),
  (select kept from g_claims),
  'T-0504 AC-1 auth.users.raw_user_meta_data keeps only the auth claims after a Google-shaped insert');
select is(
  (select identity_data from auth.identities
    where provider = 'google' and provider_id = 'g-123'),
  (select kept from g_claims),
  'T-0504 AC-1 auth.identities.identity_data keeps only the auth claims after a Google-shaped insert');
select is(
  (select email from auth.identities where provider = 'google' and provider_id = 'g-123'),
  'g@test.local',
  'T-0504 AC-1 the generated auth.identities.email still reads the email');
select has_trigger('auth', 'users', 'auth_users_strip_profile',
  'T-0504 AC-1 trigger auth_users_strip_profile exists on auth.users');
select has_trigger('auth', 'identities', 'auth_identities_strip_profile',
  'T-0504 AC-1 trigger auth_identities_strip_profile exists on auth.identities');

-- AC-2: update path (a returning Google user, or updateUser({ data })) -----------------------
update auth.users
   set raw_user_meta_data = raw_user_meta_data || '{"full_name":"X","picture":"p"}'
 where id = '00000000-0000-0000-0000-0000000000f1';
update auth.identities
   set identity_data = identity_data || '{"full_name":"X","picture":"p"}'
 where provider = 'google' and provider_id = 'g-123';

select ok(
  (select not (raw_user_meta_data ?| array['full_name', 'picture'])
     from auth.users where id = '00000000-0000-0000-0000-0000000000f1'),
  'T-0504 AC-2 an update of raw_user_meta_data cannot add full_name or picture');
select is(
  (select array[raw_user_meta_data->>'sub', raw_user_meta_data->>'email']
     from auth.users where id = '00000000-0000-0000-0000-0000000000f1'),
  array['g-123', 'g@test.local'],
  'T-0504 AC-2 sub and email in raw_user_meta_data are unchanged by the update');
select ok(
  (select not (identity_data ?| array['full_name', 'picture'])
     from auth.identities where provider = 'google' and provider_id = 'g-123'),
  'T-0504 AC-2 an update of identity_data cannot add full_name or picture');
select is(
  (select array[identity_data->>'sub', identity_data->>'email']
     from auth.identities where provider = 'google' and provider_id = 'g-123'),
  array['g-123', 'g@test.local'],
  'T-0504 AC-2 sub and email in identity_data are unchanged by the update');

-- AC-3: harmless for everyone else -----------------------------------------------------------
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated', 'n@test.local', null),
  ('00000000-0000-0000-0000-0000000000f3', 'authenticated', 'authenticated', 'o@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000f4', 'authenticated', 'authenticated', 'e@test.local',
   '{"sub":"00000000-0000-0000-0000-0000000000f4","email":"e@test.local","email_verified":true,"phone_verified":false}');

select is(
  (select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000000f2'),
  null,
  'T-0504 AC-3 a null raw_user_meta_data stays null');
select is(
  (select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000000f3'),
  '{}'::jsonb,
  'T-0504 AC-3 an empty raw_user_meta_data stays {}');
select is(
  (select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000000f4'),
  '{"sub":"00000000-0000-0000-0000-0000000000f4","email":"e@test.local","email_verified":true,"phone_verified":false}'::jsonb,
  'T-0504 AC-3 an email user''s metadata is stored unchanged');
select is(private.strip_profile_claims(null::jsonb), null,
  'T-0504 AC-3 private.strip_profile_claims(null) is null');

-- AC-5: backfill -----------------------------------------------------------------------------
-- `alter table auth.users disable trigger` needs table ownership (supabase_auth_admin), which
-- `postgres` lacks. Instead, inside this transaction only, the two trigger functions (owned by
-- `postgres`) are replaced with no-ops, so the rows below keep G and only the backfill itself
-- can strip them. The rollback at the end restores the real functions.
create or replace function private.auth_users_strip_profile() returns trigger
  language plpgsql set search_path = '' as $$ begin return new; end; $$;
create or replace function private.auth_identities_strip_profile() returns trigger
  language plpgsql set search_path = '' as $$ begin return new; end; $$;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
  select '00000000-0000-0000-0000-0000000000f5', 'authenticated', 'authenticated', 'h@test.local', g
    from g_claims;
insert into auth.identities (provider_id, user_id, provider, identity_data)
  select 'g-555', '00000000-0000-0000-0000-0000000000f5', 'google',
         g || '{"sub":"g-555","provider_id":"g-555","email":"h@test.local"}' from g_claims;

select cmp_ok(private.strip_profile_claims_backfill(), '>=', 2,
  'T-0504 AC-5 the backfill changes the pre-existing rows');
select is(
  (select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-0000000000f5'),
  (select kept from g_claims),
  'T-0504 AC-5 the backfill strips a pre-existing auth.users row');
select is(
  (select identity_data from auth.identities where provider = 'google' and provider_id = 'g-555'),
  (select kept || '{"sub":"g-555","provider_id":"g-555","email":"h@test.local"}' from g_claims),
  'T-0504 AC-5 the backfill strips a pre-existing auth.identities row');
select is(private.strip_profile_claims_backfill(), 0,
  'T-0504 AC-5 the backfill is idempotent: a second run changes 0 rows');

-- AC-6: not exposed --------------------------------------------------------------------------
select function_privs_are('private', 'strip_profile_claims', array['jsonb'], 'anon', array[]::text[],
  'T-0504 AC-6 anon has no execute on private.strip_profile_claims');
select function_privs_are('private', 'strip_profile_claims', array['jsonb'], 'authenticated', array[]::text[],
  'T-0504 AC-6 authenticated has no execute on private.strip_profile_claims');
select function_privs_are('private', 'auth_users_strip_profile', array[]::text[], 'anon', array[]::text[],
  'T-0504 AC-6 anon has no execute on private.auth_users_strip_profile');
select function_privs_are('private', 'auth_users_strip_profile', array[]::text[], 'authenticated', array[]::text[],
  'T-0504 AC-6 authenticated has no execute on private.auth_users_strip_profile');
select function_privs_are('private', 'auth_identities_strip_profile', array[]::text[], 'anon', array[]::text[],
  'T-0504 AC-6 anon has no execute on private.auth_identities_strip_profile');
select function_privs_are('private', 'auth_identities_strip_profile', array[]::text[], 'authenticated', array[]::text[],
  'T-0504 AC-6 authenticated has no execute on private.auth_identities_strip_profile');
select function_privs_are('private', 'strip_profile_claims_backfill', array[]::text[], 'anon', array[]::text[],
  'T-0504 AC-6 anon has no execute on private.strip_profile_claims_backfill');
select function_privs_are('private', 'strip_profile_claims_backfill', array[]::text[], 'authenticated', array[]::text[],
  'T-0504 AC-6 authenticated has no execute on private.strip_profile_claims_backfill');

select * from finish();
rollback;
