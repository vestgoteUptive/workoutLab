---
id: T-0555
title: "Seed guard as an allow-list, and psql error lines redacted (T-0554 security follow-ups T1/T2)"
lane: infra
screens: []
decisions: [D-0201]
deps: [T-0554]
status: ready
---

## Why
T-0554 security review (docs/security/T-0543-review.md, section T-0554). The seed now runs as the postgres role on every release.
- **T1:** `checkSeed` is a deny-list. It misses dynamic SQL in DO blocks, UPDATE, ALTER TYPE, RENAME and upserts into user tables.
- **T2:** psql's own `psql:file:N: ERROR: <message>` lines aren't redacted.

## Acceptance criteria
- AC-1: the seed guard is an allow-list. Only comments, `begin;`, `commit;` and `INSERT INTO public.(exercises|exercise_areas|exercise_variants) … ON CONFLICT … DO UPDATE|NOTHING` statements are allowed, and anything else fails closed. Red tests cover DO, UPDATE, ALTER, an insert into another table, and DELETE. The real seed passes.
- AC-2: the seed runs with `psql -X -v VERBOSITY=sqlstate`, and `redact_rows` also redacts `psql:…: ERROR:` message text, keeping the SQLSTATE. Tests cover both.
- AC-3: existing release, backup, guard and deploy-workflow tests stay green.

## Paths you may change
- `infra/**`, `.github/**`, `docs/security/**` (security review notes)

## Contract impact
None.

## Build / accept log
