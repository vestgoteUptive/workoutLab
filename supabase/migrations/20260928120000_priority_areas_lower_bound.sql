-- T-0102b: profiles_priority_areas_valid also requires array_lower(priority_areas, 1) = 1
-- (D-0037 §11). Without it, '[2:3]={back,back}' passed: priority_areas[1] is null there, so the
-- duplicate checks compared against null and let the row through. An empty array has
-- array_lower null and array_ndims null, so '{}' stays valid.
alter table public.profiles drop constraint profiles_priority_areas_valid;
alter table public.profiles add constraint profiles_priority_areas_valid check (
  (array_ndims(priority_areas) is null or array_ndims(priority_areas) = 1)
  and (array_lower(priority_areas, 1) is null or array_lower(priority_areas, 1) = 1)
  and cardinality(priority_areas) <= 3
  and priority_areas <@ array['chest','back','shoulders','arms','core','glutes','quads','hamstrings','calves']::text[]
  and (cardinality(priority_areas) < 2 or priority_areas[1] <> priority_areas[2])
  and (cardinality(priority_areas) < 3
       or (priority_areas[1] <> priority_areas[3] and priority_areas[2] <> priority_areas[3]))
);
