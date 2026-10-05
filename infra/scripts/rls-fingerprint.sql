-- T-0402c AC-4 (D-0184 §6, D-0186 §1): the RLS fingerprint of the `public` schema. One read-only
-- query; it emits schema metadata only (no row data), one sorted text line per fact:
--   rel     each public relation except indexes: name, relkind, RLS on, RLS forced, reloptions
--   policy  each pg_policies row in public: table, name, permissive, sorted roles, cmd, qual, check
--   grant   each role_table_grants row in public for anon and authenticated
--   schema  USAGE and CREATE of anon and authenticated on analytics and private
-- Run it through infra/scripts/rls-fingerprint.sh, which hashes the output. Equal hashes on local
-- and prod mean prod runs the policies that 002 and 015 tested.
select line from (
  select format('rel|%s|%s|rls=%s|force=%s|opts=%s',
           c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
           coalesce((select string_agg(o, ',' order by o) from unnest(c.reloptions) o), '')) as line
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind not in ('i', 'I')
  union all
  select format('policy|%s|%s|%s|roles=%s|%s|qual=%s|check=%s',
           p.tablename, p.policyname, p.permissive,
           (select string_agg(r::text, ',' order by r::text) from unnest(p.roles) r),
           p.cmd,
           coalesce(regexp_replace(p.qual, '\s+', ' ', 'g'), '<null>'),
           coalesce(regexp_replace(p.with_check, '\s+', ' ', 'g'), '<null>'))
  from pg_policies p
  where p.schemaname = 'public'
  union all
  select format('grant|%s|%s|%s|grantable=%s', g.table_name, g.grantee, g.privilege_type, g.is_grantable)
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
  union all
  select format('schema|%s|%s|usage=%s|create=%s', s, r,
           has_schema_privilege(r, s, 'USAGE'), has_schema_privilege(r, s, 'CREATE'))
  from unnest(array['analytics', 'private']) s cross join unnest(array['anon', 'authenticated']) r
) t
order by line collate "C";
