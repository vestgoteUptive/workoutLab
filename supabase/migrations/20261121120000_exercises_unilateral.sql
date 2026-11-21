-- T-0972 (UF-04.2, UF-09.3, D-0260 §3, D-0263 §3): which side-by-side unit an exercise is
-- trained in, when it is trained one side at a time. null = both sides at once (the default).
-- Forward-only, additive: every existing row keeps null until the seed sets it.
alter table public.exercises
  add column unilateral text null,
  add constraint exercises_unilateral_valid check (unilateral in ('arm', 'leg', 'side'));
