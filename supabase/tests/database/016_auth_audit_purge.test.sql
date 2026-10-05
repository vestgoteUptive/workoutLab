-- T-0503 (UF-11.4, NFR-PRIV-5, D-0188 §1): deleting an auth user purges that user's
-- auth.audit_log_entries rows by exact key match (actor_id, traits.user_id, actor_username,
-- traits.user_email); other users' rows stay, including one whose email contains the deleted
-- user's email as a substring.
begin;
select plan(9);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'ba@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated', null),
  ('00000000-0000-0000-0000-00000000000e', 'authenticated', 'authenticated', 'e@test.local');

insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"00000000-0000-0000-0000-00000000000a","actor_username":"a@test.local"}',
   now(), '203.0.113.7'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","traits":{"user_id":"00000000-0000-0000-0000-00000000000a","user_email":"a@test.local"}}',
   now(), '203.0.113.7'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"user_modified","actor_id":"00000000-0000-0000-0000-0000000000ff","actor_username":"a@test.local"}',
   now(), '203.0.113.7'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"00000000-0000-0000-0000-00000000000b","actor_username":"b@test.local"}',
   now(), '203.0.113.7'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"00000000-0000-0000-0000-00000000000c","actor_username":"ba@test.local"}',
   now(), '203.0.113.7'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"00000000-0000-0000-0000-00000000000d","actor_username":""}',
   now(), '203.0.113.7');

-- The fixture matches A by each of the four keys before the delete.
select is(
  (select count(*)::int from auth.audit_log_entries e
    where e.payload->>'actor_id' = '00000000-0000-0000-0000-00000000000a'
       or e.payload->'traits'->>'user_id' = '00000000-0000-0000-0000-00000000000a'
       or e.payload->>'actor_username' = 'a@test.local'
       or e.payload->'traits'->>'user_email' = 'a@test.local'),
  3, 'T-0503 AC-1 fixture: 3 audit rows match A before the delete');

-- AC-1 -----------------------------------------------------------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';

select is(
  (select count(*)::int from auth.audit_log_entries e
    where e.payload->>'actor_id' = '00000000-0000-0000-0000-00000000000a'
       or e.payload->'traits'->>'user_id' = '00000000-0000-0000-0000-00000000000a'
       or e.payload->>'actor_username' = 'a@test.local'
       or e.payload->'traits'->>'user_email' = 'a@test.local'),
  0, 'T-0503 AC-1 after deleting A, no audit row matches A by any of the four keys');

select is(
  (select count(*)::int from auth.audit_log_entries e
    where e.payload->>'actor_id' in ('00000000-0000-0000-0000-00000000000b',
                                     '00000000-0000-0000-0000-00000000000c')),
  2, 'T-0503 AC-1 B''s row and C''s (ba@test.local) row are still there');

select has_trigger('auth', 'users', 'auth_users_purge_audit',
  'T-0503 AC-1 auth.users has the auth_users_purge_audit trigger');

-- AC-2 -----------------------------------------------------------------------------------------
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000d'$$,
  'T-0503 AC-2 deleting user D (no email) succeeds');
select is(
  (select count(*)::int from auth.audit_log_entries e
    where e.payload->>'actor_id' = '00000000-0000-0000-0000-00000000000d'),
  0, 'T-0503 AC-2 D''s row is gone (id match runs without an email)');
select lives_ok($$delete from auth.users where id = '00000000-0000-0000-0000-00000000000e'$$,
  'T-0503 AC-2 deleting user E (no audit rows) succeeds');

-- AC-5 -----------------------------------------------------------------------------------------
select function_privs_are('private', 'purge_auth_audit_for_user', array[]::text[], 'anon',
  array[]::text[], 'T-0503 AC-5 anon has no execute on private.purge_auth_audit_for_user()');
select function_privs_are('private', 'purge_auth_audit_for_user', array[]::text[], 'authenticated',
  array[]::text[], 'T-0503 AC-5 authenticated has no execute on private.purge_auth_audit_for_user()');

select * from finish();
rollback;
