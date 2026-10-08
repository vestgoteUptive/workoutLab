---
id: T-0555
title: "Seed guard as an allow-list, and psql error lines redacted (T-0554 security follow-ups T1/T2)"
lane: infra
screens: []
decisions: [D-0201]
deps: [T-0554]
status: doing
---

## Why
T-0554 security review (docs/security/T-0543-review.md, section T-0554). The seed now runs as the postgres role on every release.
- **T1:** `checkSeed` is a deny-list. It misses dynamic SQL in DO blocks, UPDATE, ALTER TYPE, RENAME and upserts into user tables.
- **T2:** psql's own `psql:file:N: ERROR: <message>` lines aren't redacted.

## Acceptance criteria
- AC-1: the seed guard is an allow-list. Only comments, `begin;`, `commit;` and `INSERT INTO public.(exercises|exercise_areas|exercise_variants) … ON CONFLICT … DO UPDATE|NOTHING` statements are allowed, and anything else fails closed. Red tests cover DO, UPDATE, ALTER, an insert into another table, and DELETE. The real seed passes.
- AC-2: the seed runs with `psql -X -v VERBOSITY=sqlstate`, and `redact_rows` also redacts `psql:…: ERROR:` message text, keeping the SQLSTATE. Tests cover both.
- AC-2b: the migration guard treats privilege statements (`GRANT … ON …` / `REVOKE … ON … FROM …`, including `revoke truncate, references, trigger on …`) as non-destructive. Today T-0535's migration (`supabase/migrations/20261007120000_excluded_exercises.sql`, line 36) is BLOCKED as TRUNCATE. Tests: that exact line passes, while a real `TRUNCATE public.x` and `truncate table x` stay red.
- AC-3: existing release, backup, guard and deploy-workflow tests stay green.

## Paths you may change
- `infra/**`, `.github/**`, `docs/security/**` (security review notes)

## Contract impact
None.

## Build / accept log

- Build (infra): migration-guard `checkSeed` is now an allow-list (begin/commit/upsert into exercises, exercise_areas, exercise_variants; select/with/returning also refused); `checkSql` drops GRANT/REVOKE statements before matching; seed run is `psql -X -v VERBOSITY=sqlstate ...`; `redact_rows` (release + backup scripts) redacts `psql:…: ERROR:` text, keeps a bare SQLSTATE.
- AC map: AC-1 migration-guard.test "T-0555 AC-1" + the real-seed test; AC-2 supabase-prod-release.test "AC-1 flags" and "T-0555 AC-2"; AC-2b "T-0555 AC-2b" (exact T-0535 line green, `TRUNCATE public.x` / `truncate table x` red). AC-3 whole `.github/scripts/*.test.mjs` 369/369.
- Red on unfixed code: guard on T-0535's real migration (plan listing 20261007120000_excluded_exercises.sql) was BLOCKED (TRUNCATE) before, passes now. Old seed test `insert into t` now correctly red under the allow-list, test updated to `public.exercises`.
- Planted faults (backup copy, restored by cp): no GRANT/REVOKE filter -> AC-2b test red; seed guard allows all -> AC-1 tests red; psql redaction rule deleted -> AC-2 test red.
- Gate: node --test .github/scripts 369/369; test:repo-checks, format:check, check-all, check-deploy-workflow green.
