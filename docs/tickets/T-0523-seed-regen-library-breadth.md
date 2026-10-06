---
id: T-0523
title: "Regenerate supabase/seed.sql for T-0522's nine new exercises and prove the seed tests; prod apply is a human release (D-0192, D-0053 §2)"
lane: backend
screens: [UF-04.1]
decisions: [D-0192, D-0053]
deps: [T-0522]
status: todo
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner from GitHub #32. Build flow: wl-build-backend. About ⅙ day.
At merge the orchestrator raises a needs-human item to run infra/scripts/supabase-prod-release.sh
(plan, review, apply), as for H-19/H-23. -->

## Why
The app reads the exercise library from Supabase (`exercises`, `exercise_areas`,
`exercise_variants`). `supabase/seed.sql` is generated from `data/exercises/library/*.json`
(`supabase/scripts/gen-seed.mjs`, D-0053 §2). Without a regenerated seed, T-0522's rows never
reach the app, and a set logged against an id that isn't in the database would fail its foreign key.

## Scope
- In: run the generator, commit the regenerated `supabase/seed.sql`, and make the existing seed
  tests (idempotency, drift between seed and library) pass.
- Out: applying to prod (human).

## Acceptance criteria
- AC1 Given T-0522 merged, When the seed drift test compares `seed.sql` with the library, Then it
  passes. On the pre-regeneration seed it fails (a red run is recorded in the log).
- AC2 Given the local Supabase stack, When `seed.sql` is applied twice, Then `exercises` has 87
  rows and the second apply changes nothing (the existing idempotency test).
- AC3 Given the seeded stack, Then each of the nine new ids has its `exercise_areas` rows matching
  its JSON weights.

## Paths you may change
`supabase/seed.sql`, `supabase/tests/**`.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0523`.

## Build / accept log

- Build (backend): ran `node supabase/scripts/gen-seed.mjs` (no hand edit); seed.sql +351 lines.
- AC1: red on pre-regen seed: `node supabase/scripts/gen-seed.mjs --check` exit 1 (prints supabase/seed.sql); after regen exit 0; `node --test supabase/tests/scripts/gen-seed.test.mjs` 8/8 pass.
- AC2/AC3: need local Supabase; the `supabase` CLI is not installed in this worktree environment, so `supabase db reset` and the DB-backed seed-roundtrip test were NOT run here (not worked around). Library has 87 exercise JSON files = 87 `exercises` rows expected.
- Human prod apply (after merge; needs SUPABASE_ACCESS_TOKEN and PROD_DB_URL in env):
  plan: `bash infra/scripts/supabase-prod-release.sh`
  apply: `CONFIRM_PROD_RELEASE=csgjsdwuxqtuqpuazzpz bash infra/scripts/supabase-prod-release.sh apply`
  Expected: `exercises` 87 rows (78 + 9 new); `exercise_areas` and `exercise_variants` gain rows for the nine new ids plus the variant ids on 18 existing rows; re-apply is a no-op (idempotent upserts).
