---
id: T-0569
title: "UF-11.6 Favorite exercises at /plan/favorites (grouped list, search, Add/Remove, engine-eligibility lines, empty states) + UF-11.2 \"Favorite exercises · n\" row + UF-11.5 move line"
lane: web-feature:UF-11
screens: [UF-11.6, UF-11.2, UF-11.5]
decisions: [D-0202, D-0199, D-0203, D-0071]
deps: [T-0561, T-0567]
status: todo
---
<!-- Written by product-owner 2026-10-08 (groom, D-0202 §8, GitHub #46). Flow: wl-build-web (agent frontend-dev). About ½ day (T-0540's shape; reuse ExcludedBody/ExcludedRow patterns, generalise inside UF-11 rather than copy). routes.ts is a shared file: no other ticket editing routes.ts may run in parallel. -->

## Why
D-0202 §8: the user manages favorites in one calm place under Plan, the mirror of UF-11.5 (T-0540). Spec: `docs/specs/favorite-exercises.md` §UF-11.6.

## Scope
- In:
  - **Route** `/plan/favorites` → UF-11.6 (`data-screen-id="UF-11.6"`), back link to Plan as on UF-11.5. Never linked from UF-03, UF-08 or UF-09.
  - **UF-11.2 row** "Favorite exercises · {n}" ("Favorite exercises · none" at 0) directly above "Excluded exercises · n", linking to `/plan/favorites`.
  - **UF-11.6** per T-0561's spec: header, lead line, search field "Search exercises".
    - Empty query: favorites grouped by area in the fixed order (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves), only areas with a favorite; an exercise under each area where its weight is 1.0; by name then id; each row: name, **Remove** ("Remove {name} from favorites"), and the line "Not available with your equipment" when `isEligible(e, {...profile, level: "advanced"}, [])` is false, otherwise "Above your level" when `isEligible(e, profile, [])` is false.
    - Query: case-insensitive name substring over library rows of kind `exercise`, by name then id, no warm-up move; each result shows its primary areas and **Add** ("Add {name} to favorites") or "Favorite" + Remove; an excluded result also shows "Excluded".
    - Empty states: "No favorites yet. Search to add one, or tap Favorite on an exercise." / "No exercises match “{query}”."
    - Move line (`role="status"`): Add on an excluded exercise → "{name} is a favorite and will be suggested again."
    - `refreshFavorites()` on mount.
  - **UF-11.5 move line:** Exclude on an exercise that is a favorite → "{name} won't be suggested. Removed from favorites." (the T-0567 cache drop removes it from favorites).
  - Offline: Add and Remove `aria-disabled` with one "Connect to change favorites" line, re-enabled on `online` without reload. Failure: "Couldn't save. Try again." (`role="alert"`), list unchanged.
  - e2e `tests/e2e/uf-11-favorites.spec.ts` (new) with axe.
- Out: UF-04 (T-0568); UF-08 (T-0571); a favorite cap (none, D-0202).

### Edge cases that are in scope
- **Offline** and back online (AC6). **Write fails** (AC7). **Zero favorites** (AC5). **Equipment or level makes a favorite unusable** (AC4). **Favorite that is excluded** via UF-11.6 Add (AC3) and via UF-11.5 Exclude (AC8).
- Time running out, returning after 10 days: not applicable (favorites never expire; no workout here).

## Acceptance criteria
Fixtures: L1 library, F-profile (all equipment, intermediate) unless stated, user A, online unless stated.
- **AC1 (UF-11.2 row)** Given favorites [back-squat, lateral-raise] and excluded [plank], Then UF-11.2 shows "Favorite exercises · 2" immediately before "Excluded exercises · 1". Given no favorites, Then "Favorite exercises · none".
- **AC2 (grouped list)** When the user opens the row, Then the URL is `/plan/favorites`, `[data-screen-id="UF-11.6"]` is visible, and the groups are Shoulders: Lateral raise; Glutes: Back squat; Quads: Back squat, in that order, with no other area heading.
- **AC3 (search and Add)** Given back-squat is a favorite and bench-press is excluded, When the user types "BENCH", Then the results are Bench press ("Excluded", Add) then Dumbbell bench press (Add), and no warm-up move. When they tap "Add Bench press to favorites", Then one upsert is made, Bench press shows "Favorite" + Remove and no "Excluded", and the status reads "Bench press is a favorite and will be suggested again."
- **AC4 (eligibility lines)** Given equipment [] and favorites [back-squat], Then both Back squat rows read "Not available with your equipment". Given level beginner, full equipment and favorite pull-up, Then the Pull up row reads "Above your level". Given F-profile and favorite back-squat, Then no line.
- **AC5 (Remove and empty states)** Given favorites [back-squat, lateral-raise], When the user taps "Remove Lateral raise from favorites", Then the Shoulders group is gone and UF-11.2 shows "Favorite exercises · 1". Given no favorites and an empty query, Then "No favorites yet. Search to add one, or tap Favorite on an exercise."; given "zzz", Then "No exercises match “zzz”."
- **AC6 (offline and back)** Given offline, Then every Add and Remove is `aria-disabled="true"`, described by the one "Connect to change favorites" line, and a tap makes no request; the list still shows the cached favorites. When `online` fires, Then they are enabled without a reload.
- **AC7 (write failure)** Given the upsert rejects, When the user taps Add on Dumbbell bench press, Then the list is unchanged, "Couldn't save. Try again." is shown with `role="alert"`, and Add is enabled again.
- **AC8 (UF-11.5 move)** Given bench-press is a favorite, When the user excludes it on UF-11.5, Then UF-11.5's status reads "Bench press won't be suggested. Removed from favorites." and UF-11.2 shows "Favorite exercises · none".
- **AC9 (route table, e2e, axe)** The route tests list `/plan/favorites`; `uf-11-favorites.spec.ts` covers AC1–AC3 in a real browser and an offline load of `/plan/favorites` with cached favorites (D-0091 §1: seeded data, built content asserted); axe reports no violations on UF-11.6 with and without favorites.

Checklist (D-0197 §7): online/offline (AC6); empty/non-empty (AC1, AC5); write success/failure (AC3, AC7).

## Paths you may change
- `apps/web/src/features/UF-11/**` (lane)
- `apps/web/src/lib/i18n/flows/uf-11.ts` (own flow file)
- `apps/web/src/app/routes.ts` (the `/plan/favorites` route)
- `apps/web/src/app/__tests__/**` (route-table tests that list every route)
- `tests/e2e/uf-11-favorites.spec.ts` (new file)

## Contract impact
None.

## Definition of done
Every AC has a passing test · `pnpm -w typecheck lint test` green · the UF-11 e2e specs green (routes.ts changed: run the whole web e2e suite once) · contracts unchanged · commits start with `T-0569:` and cite UF-11.6 / UF-11.2.

## Build / accept log
Archived in `docs/tickets/log/T-0569.md` (D-0157).
