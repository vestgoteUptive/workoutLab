-- T-0505 (UF-11.4, D-0190, NFR-PRIV-4/5): a catalog drift guard. Every public table that holds a
-- user's rows must cascade on account deletion, and must be named in the literal list below, which
-- apps/web/src/lib/account/__tests__/export-tables-drift.test.ts ties to EXPORT_TABLES. A new user
-- table therefore has to join the list (and the export) on purpose.
-- Each check lists its offenders as text and expects '', so a failure names the table.
begin;
select plan(3);

create temporary table owned_list (name text primary key) on commit drop;
insert into owned_list (name) values
-- OWNED_TABLES:BEGIN
  ('area_targets'),
  ('excluded_exercises'),
  ('plan_checkins'),
  ('profiles'),
  ('routine_items'),
  ('routines'),
  ('session_sets'),
  ('sessions')
-- OWNED_TABLES:END
;

-- Foreign keys from a public table to auth.users, with the columns they cover.
create temporary table user_fks on commit drop as
  select c.conrelid::regclass::text as tbl, c.confdeltype, c.conname,
         array(select a.attname::text from pg_attribute a
               where a.attrelid = c.conrelid and a.attnum = any (c.conkey)) as cols
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public';

select is(
  (select coalesce(string_agg(tbl || '.' || conname, ', ' order by tbl, conname), '')
   from user_fks where confdeltype <> 'c'),
  '', 'T-0505 AC-1 every foreign key from public to auth.users is ON DELETE CASCADE');

select is(
  (select coalesce(string_agg(x.name, ', ' order by x.name), '')
   from (
     (select regexp_replace(tbl, '^public\.|"', '', 'g') as name from user_fks
      except select name from owned_list)
     union all
     (select name from owned_list
      except select regexp_replace(tbl, '^public\.|"', '', 'g') from user_fks)
   ) x),
  '', 'T-0505 AC-1 the public tables with a foreign key to auth.users equal the OWNED_TABLES list');

select is(
  (select coalesce(string_agg(col.table_name, ', ' order by col.table_name), '')
   from information_schema.columns col
   join pg_class t on t.relname = col.table_name and t.relkind in ('r', 'p')
   join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
   where col.table_schema = 'public' and col.column_name = 'user_id'
     and not exists (select 1 from user_fks f
                     where f.tbl::text in (col.table_name, 'public.' || col.table_name, '"' || col.table_name || '"')
                       and 'user_id' = any (f.cols))),
  '', 'T-0505 AC-1 every public table with a user_id column has a foreign key on it to auth.users');

select * from finish();
rollback;
