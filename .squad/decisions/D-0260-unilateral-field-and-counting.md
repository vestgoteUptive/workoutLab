---
id: D-0260
title: "One side at a time: reps are per side, weight is one implement, one set covering both sides is one hard set; optional library field unilateral (arm, leg, side) and a matching exercises column; sets are unchanged"
status: decided
date: 2026-11-20
by: product-owner
area: product
supersedes: null
builds-on: D-0033, D-0026, D-0250, D-0254
---
## Context
The owner asked whether an exercise done one arm at a time logs reps per arm or the whole set. The orchestrator answered per arm; the owner asked to file it as an idea. Spec: `docs/specs/unilateral-exercises.md`.

## Decision
1. **Counting rule.** For a one-side-at-a-time exercise, reps (or seconds) are per side, weight is the load in one hand or on one side, and one set covering both sides is one hard set. Coverage, targets, balance and e1RM (D-0254, no side factor) are unchanged.
2. **Library field.** `data/exercises/schema.json` gains optional `unilateral`: `"arm" | "leg" | "side"`; absent means both sides together. Amends D-0033's field list.
3. **Data.** The seed and `exercises` table gain `unilateral text null check (unilateral in ('arm','leg','side'))`; `docs/data-model.md`, `packages/shared` types and mapper follow. `session_sets`, `workouts` and `api/openapi.yaml` are unchanged; no stored value is multiplied.
4. **RIR.** One RIR per set; the user enters the weaker side's RIR (text only, D-0250 unchanged).
5. **Old logs** of a newly flagged row are left as logged; no migration.

## Consequences
A small contract change in `docs/data-model.md` (a nullable column) by the data ticket. Down-level caches read a missing field as both sides.

## Revisit when
Users ask to log left and right separately, or a left-right imbalance view is wanted.
