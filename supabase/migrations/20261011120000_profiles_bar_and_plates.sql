-- T-0631 (UF-09.3, UF-11.4, D-0218, amends D-0066): the user's bar weight and plate sizes for
-- plate loading on UF-09.3 (D-0217). Two synced profile columns, kg only (H-38).
-- Write rules (D-0218 §2, D-0020): client-writable through the existing profiles_update policy.
-- profiles_before_write is unchanged, so neither column moves plan_changed_at, and an upsert
-- that omits them keeps the stored values. The existing owner policies cover them (RLS is per
-- row, not per column).
-- Forward-only, additive (D-0201): `add column ... not null default` fills every existing row
-- with the default, so no row is rewritten by hand and nothing is deleted.

-- Duplicate check for plates_kg. A check constraint can't hold a subquery, so it calls this
-- immutable helper. Execute is checked at run time, so authenticated (the role that writes
-- profiles) gets it; the private schema stays unexposed (no usage grant, not in PostgREST).
create function private.numeric_array_distinct(a numeric[]) returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select count(*) = count(distinct x) from pg_catalog.unnest(a) as t(x)
$$;
revoke all on function private.numeric_array_distinct(numeric[]) from public, anon, authenticated;
grant execute on function private.numeric_array_distinct(numeric[]) to authenticated, service_role;

alter table public.profiles
  add column bar_kg numeric(5,2) not null default 20,
  add column plates_kg numeric(5,2)[] not null default '{25,20,15,10,5,2.5,1.25}';

alter table public.profiles add constraint profiles_bar_kg_range check (
  bar_kg between 0 and 50
);

-- One-dimensional, lower bound 1 (an empty array has null ndims and lower bound), at most 12
-- sizes, every element > 0 and <= 50 (a null element is rejected: `0 < all` would be null),
-- no duplicates. The CASE makes the shape test run first: array_position raises 2202E on a
-- multidimensional array, and a bare AND does not promise evaluation order.
alter table public.profiles add constraint profiles_plates_kg_valid check (
  case
    when (array_ndims(plates_kg) is null or array_ndims(plates_kg) = 1)
     and (array_lower(plates_kg, 1) is null or array_lower(plates_kg, 1) = 1)
    then cardinality(plates_kg) <= 12
     and array_position(plates_kg, null) is null
     and 0 < all (plates_kg)
     and 50 >= all (plates_kg)
     and private.numeric_array_distinct(plates_kg)
    else false
  end
);
