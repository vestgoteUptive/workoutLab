-- T-0402c AC-1 (UF-01.5, D-0184 §6, D-0020): a catalog proof that RLS covers every relation in
-- `public`, so a signed-in preview tester on prod is held to their own rows. 002 proves the
-- policies behave with two users; this file proves no table or view is left out of that model.
-- Each check lists its offenders as text and expects '', so a failure names the relation.
begin;
select plan(12);

create temporary table lib (name text primary key) on commit drop;
insert into lib values ('areas'), ('exercises'), ('exercise_areas'), ('exercise_variants');

create temporary table owned on commit drop as
  select c.relname::text as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname::text not in (select name from lib);

-- A policy expression is owner-scoped when it references both auth.uid() and user_id.
create function pg_temp.owner_scoped(e text) returns boolean language sql immutable as $$
  select coalesce(position('auth.uid()' in e) > 0 and e ~ '\muser_id\M', false)
$$;

-- Every ordinary table ------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'T-0402c AC-1 every public table has row level security enabled');

select is(
  (select coalesce(string_agg(c.relname || ':' || c.relkind::text, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('m', 'f')),
  '', 'T-0402c AC-1 public has no materialized views or foreign tables (RLS cannot cover them)');

-- Library tables: read-only. Today both hold: no write privilege, and no write policy. --------
select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname::text in (select name from lib)),
  4, 'T-0402c AC-1 the four library tables exist');

select is(
  (select coalesce(string_agg(tablename || '.' || policyname || ':' || cmd, ', '
                              order by tablename, policyname), '')
   from pg_policies
   where schemaname = 'public' and tablename::text in (select name from lib) and cmd <> 'SELECT'),
  '', 'T-0402c AC-1 library tables have select policies only');

select is(
  (select coalesce(string_agg(r || ':' || t.name || ':' || p, ', ' order by r, t.name, p), '')
   from lib t
   cross join unnest(array['anon', 'authenticated']) r
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where has_table_privilege(r, 'public.' || t.name, p)),
  '', 'T-0402c AC-1 anon and authenticated hold no write privilege on library tables');

-- Owned tables: user_id, and an owner-scoped policy for authenticated per command -------------
select cmp_ok((select count(*)::int from owned), '>=', 7,
  'T-0402c AC-1 the owned-table set is not empty (sanity: at least the 7 v1 tables)');

select is(
  (select coalesce(string_agg(o.name, ', ' order by o.name), '')
   from owned o
   where not exists (
     select 1 from information_schema.columns col
     where col.table_schema = 'public' and col.table_name = o.name and col.column_name = 'user_id')),
  '', 'T-0402c AC-1 every non-library public table has a user_id column');

select is(
  (select coalesce(string_agg(o.name || ':' || c.cmd, ', ' order by o.name, c.cmd), '')
   from owned o
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) c(cmd)
   where not exists (
     select 1 from pg_policies p
     where p.schemaname = 'public' and p.tablename = o.name and p.permissive = 'PERMISSIVE'
       and p.cmd in (c.cmd, 'ALL')
       and p.roles && array['authenticated', 'public']::name[]
       and case c.cmd
             when 'INSERT' then pg_temp.owner_scoped(p.with_check)
             when 'UPDATE' then pg_temp.owner_scoped(p.qual)
                                and pg_temp.owner_scoped(coalesce(p.with_check, p.qual))
             else pg_temp.owner_scoped(p.qual)
           end)),
  '', 'T-0402c AC-1 every owned table has an owner-scoped authenticated policy for select, insert, update and delete');

-- Permissive policies are OR-ed, so one open policy would undo the owner policy beside it.
select is(
  (select coalesce(string_agg(p.tablename || '.' || p.policyname, ', '
                              order by p.tablename, p.policyname), '')
   from pg_policies p
   where p.schemaname = 'public' and p.tablename::text in (select name from owned)
     and p.permissive = 'PERMISSIVE'
     and (not (p.roles <@ array['authenticated']::name[])
          or (p.cmd in ('SELECT', 'DELETE', 'UPDATE', 'ALL') and not pg_temp.owner_scoped(p.qual))
          or (p.cmd in ('INSERT', 'UPDATE', 'ALL')
              and not pg_temp.owner_scoped(coalesce(p.with_check, p.qual))))),
  '', 'T-0402c AC-1 no permissive policy on an owned table is open beyond the owner or to anon');

select is(
  (select coalesce(string_agg(c.relname || ':' || p, ', ' order by c.relname, p), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')
     and c.relname::text not in (select name from lib)
     and has_table_privilege('anon', c.oid, p)),
  '', 'T-0402c AC-1 anon holds no privilege on owned tables or public views');

-- Views run with the caller's rights, so the base table's RLS applies ------------------------
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not exists (
       select 1 from unnest(coalesce(c.reloptions, '{}')) o
       where lower(o) in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1'))),
  '', 'T-0402c AC-1 every public view has security_invoker = true');

-- The private schemas -------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(r || ':' || s, ', ' order by r, s), '')
   from unnest(array['anon', 'authenticated']) r
   cross join unnest(array['analytics', 'private']) s
   where has_schema_privilege(r, s, 'USAGE')),
  '', 'T-0402c AC-1 anon and authenticated have no USAGE on analytics or private');

select * from finish();
rollback;
