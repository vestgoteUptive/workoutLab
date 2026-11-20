---
id: D-0251
title: "A user's own weight step per exercise: new table exercise_settings (user_id, exercise_id, increment_kg 0.25-10 in quarters), edited only on UF-04.2, no row means the library default, offline-first, last write wins"
status: revisit
date: 2026-11-20
by: product-owner (idea mode, owner request 2026-11-20)
area: data
builds-on: D-0026, D-0017, D-0199, D-0202, D-0020
---
## Context
`exercises.increment_kg` is a library value (default 2.5) that rule 14 and the High back-off floor (D-0131) read. A gym with micro plates needs 1.25. The library is read-only for clients.

## Decision
1. New user-owned table `exercise_settings`, PK `(user_id, exercise_id)`, `increment_kg numeric(4,2) not null` with checks `between 0.25 and 10` and a multiple of 0.25, server-set `created_at`/`updated_at`, FK to `exercises` on delete cascade, owner-only RLS (select, insert, update, delete for `authenticated`; `anon` none). A row exists only while an override exists; reset deletes it.
2. Plain CRUD via supabase-js `upsert(onConflict user_id,exercise_id)`; no Edge Function, no openapi change (D-0001). The export includes the table ordered by `exercise_id`.
3. The user sets it on UF-04.2 only ("Weight step" row, chips 1.25 / 2.5 / 5 / Other, "Use default"), only for loaded, non-timed exercises. kg only (D-0017). No setup in onboarding.
4. Offline: the device value applies at once, writes queue, last write wins by `updated_at`.

## Consequences
Data ticket T-0951 (migration, `docs/data-model.md`, export, RLS tests); web T-0954 and T-0956.

## Revisit when
A second per-exercise setting is wanted (it becomes a column), or users ask for one step for all exercises.
