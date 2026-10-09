---
id: T-0640
title: "UF-04.1 row tags \"In plan\" (in a cached routine), \"Variant\" (a variant of one) and \"Beginner\" (level), one tag per row after Not suggested and Favorite"
lane: web-feature:UF-04
screens: [UF-04.1]
decisions: [D-0217, D-0199, D-0202, D-0212]
deps: [T-0639]
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1). Flow: wl-build-web (agent frontend-dev). About ⅓ day. Canvas: "Exercises" (#turn-3). Spec: docs/specs/cobalt-mock-behaviour.md §3.4. Meanings are defaults (H-39). -->

## Why
The mock tags library rows with what they mean to this user ("In plan", "Variant", "Beginner"), and the owner promoted them (H-34). They help a user find the exercises they already do and safe alternatives.

## Scope
- **In:**
  - `Library.tsx` reads `loadRoutines()` and, for each exercise in a routine, `loadVariants(id)` (both from `lib/offline`, device cache only).
  - One tag per row, the first that applies: "Not suggested" (existing) → "Favorite" (existing) → "In plan" (its id is an item of any cached routine) → "Variant" (not in a routine, and a variant of an exercise that is) → "Beginner" (`level = "beginner"`).
  - Each uses the existing `.wl-uf04__tag` and the `.wl-uf04__sr` prefix.
  - Copy in `flows/uf-04.ts`: `inPlan` "In plan" / `inPlanSr` ", in your routines"; `variant` "Variant" / `variantSr` ", variant of an exercise in your routines"; `beginner` "Beginner" / `beginnerSr` ", beginner level".
- **Out:** tags on UF-04.2, UF-08.5 or UF-11.5/11.6; more than one tag per row.

## Acceptance criteria
- **AC1 (In plan).** Given a cached routine with back-squat, Then back-squat's row shows "In plan" and its link's accessible name ends ", in your routines".
- **AC2 (Variant).** Given back-squat ↔ front-squat in `exercise_variants`, Then front-squat shows "Variant"; an exercise that is both in a routine and a variant shows "In plan".
- **AC3 (Beginner).** goblet-squat (beginner, not in a routine, not a variant) shows "Beginner"; an intermediate exercise with nothing else applying shows no tag.
- **AC4 (precedence).** An excluded exercise in a routine shows only "Not suggested"; a favorite beginner exercise shows only "Favorite". Two cases.
- **AC5 (no routines).** With no cached routines, no "In plan" or "Variant" tag renders and "Beginner" still does.
- **AC6 (offline).** Offline with a warm cache, AC1–AC3 render the same, with no network call.
- **AC7 (cold cache).** Never online: the existing "The exercise library downloads…" line, and no tag.
- **AC8 (updates, e2e).** In `uf-04-library.spec.ts`, a seeded routine with back-squat shows "In plan"; after the routine is changed on the mocked server and the screen remounts online, the tag follows the new routine.
- **AC9 (a11y).** Axe reports 0 violations with all five tags present; no tag is focusable.
- **AC10 (no regressions).** The UF-04 vitest suite and the UF-04 e2e specs pass; the favorites spec's "Favorite" tag assertions are unchanged.

Checklist (D-0197 §7):
- With and without routines, variant and not, online and offline, warm and cold cache, and each precedence pair are all covered.

## Paths you may change
- `apps/web/src/features/UF-04/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-04.ts` (own flow file)
- `tests/e2e/uf-04-library.spec.ts` (listed extra)
- `docs/tickets/T-0640-uf04-in-plan-variant-beginner-tags.md` (log only)

## Contract impact
none

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `uf-04-library.spec.ts` and `uf-04-favorites.spec.ts` green · commit messages start with `T-0640` and cite UF-04.1.

## Build / accept log
