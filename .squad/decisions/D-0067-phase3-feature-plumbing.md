---
id: D-0067
title: Phase 3 feature plumbing (T-0305–T-0308 groom) — split per flow, lanes per flow, sub-routes, per-flow i18n modules, offline caches v2, principle-1 import bans, cross-flow seams
status: revisit
date: 2026-09-29
by: product-owner (T-0305–T-0308 groom)
area: web
---
> **Superseded in part by D-0071 (2026-09-29, TR-0030).** §2's routes, string modules and import bans are replaced by D-0071 §1, §2 and §9, and the T-0318 ticket file now holds that scope. §4 (seams) is replaced by D-0071 §3–§4 and §7. §5 (session-state seam) is replaced by D-0071 §5. The Consequences line "the product-owner writes the T-0318 and T-0319 ticket files" is discharged: triage wrote them. §1 (split per flow) and §3 (offline caches v2, now the T-0319 ticket) stay in force.

## Context
T-0305–T-0308 each combine two or three screens. The board also lists T-0307 as one lane (web-feature:UF-06), but `ownership.yaml` gives each flow its own path, `apps/web/src/features/<flow>/**`. So UF-10 code isn't in the UF-06 lane. Web builds have died on time and budget when tickets were big (`.squad/state.md`). Grooming also found four shared gaps that no feature lane may fill alone:
1. **Routes.** D-0045 §2 has no route for UF-03.3, UF-04.3, UF-06.2, UF-07.1 or UF-11.3. `/progress`, `/plan` and `/session/:sessionId` are exact paths, so a feature can't add a sub-route. `apps/web/src/app/routes.ts` belongs to web-shell.
2. **Strings.** NFR-I18N-1 puts every string in `apps/web/src/lib/i18n` (web-shell). If six feature tickets all edit `en.ts`, their paths overlap, and they can't run in parallel.
3. **Offline data.** The T-0300c Dexie cache holds only engine-shaped rows (`LibraryExercise`, history, targets, profile). UF-04 needs the exercise text and variants (NFR-OFF-1: "the exercise library is cached"). UF-06 and UF-11 need session rows (`started_at`), because `checkinSessions` needs `{id, startedAt}`. UF-11 needs `plan_checkins`, and UF-07 and UF-11.2 need routines. One Dexie version bump in `lib/offline` has to add all of these.
4. **Principle 1.** D-0060 §8 already stops C-01 from being imported in UF-03, UF-08 and UF-09. Nothing yet stops the check-in card (UF-11) or Balance (UF-10) from being imported there.

## Decision
1. **Split, one lane per flow.**
   - T-0305 → T-0305a (UF-03.1/.2) and T-0305b (UF-03.3), both web-feature:UF-03.
   - T-0306 → T-0306a (UF-04, web-feature:UF-04) and T-0306b (UF-05.1, web-feature:UF-05).
   - T-0307 → T-0307a (UF-10, web-feature:UF-10) and T-0307b (UF-06, web-feature:UF-06).
   - T-0308 → T-0308a (UF-07.1, web-feature:UF-07), T-0308b (UF-11.2/.3, web-feature:UF-11) and T-0308c (UF-11.1 card, web-feature:UF-11, after b).
   - The parents stay on the board as `split → …` (the TR-0015 / D-0045 §1 pattern). Each parent file holds its children's ACs, tagged [a]/[b]/[c].
2. **Prerequisite T-0318 (web-shell, about 2 h).** It contains:
   - **New routes**, each lazy:
     | Path | Screen | Guard | Tab bar | Export |
     |---|---|---|---|---|
     | `/session/:sessionId/summary` | UF-03.3 | session | no | `features/UF-03` `Summary` |
     | `/library/:exerciseId/compare/:otherId` | UF-04.3 | protected | yes | `features/UF-04` `Compare` |
     | `/progress/:exerciseId` | UF-06.2 | protected | yes | `features/UF-06` `ExerciseHistory` |
     | `/plan/edit` | UF-11.3 | protected | no | `features/UF-11` `EditPlan` |
     | `/plan/routines/new` | UF-07.1 | protected | no | `features/UF-07` `RoutineEditor` |
     | `/plan/routines/:routineId` | UF-07.1 | protected | no | `features/UF-07` `RoutineEditor` |
   - **Stubs:** the stub exports for those routes, with a `data-screen-id` and a title (the T-0300a precedent: feature `index.tsx` stubs as explicit extras).
   - **C-02:** the tab bar's active tab follows the path prefix (`/progress/*` → Progress, `/library/*` → Library).
   - **Per-flow string modules:** one per flow, `apps/web/src/lib/i18n/flows/uf-NN.ts` for UF-01…UF-11, each exporting an empty `as const` object. `en.ts` composes them as `en.uf03`, `en.uf04` and so on. From then on, **each feature ticket owns only its own flow file**, listed as an explicit extra path. `en.ts` doesn't change again for a feature.
   - **Import bans:** `no-restricted-imports` in `apps/web/eslint.config.mjs` stops `src/features/UF-03|UF-08|UF-09/**` from importing `features/UF-02`, `UF-06`, `UF-07`, `UF-10` or `UF-11` (principle 1, D-0018). Imports of `features/UF-04` (the how-to sheet) and `features/UF-05` (the swap sheet) stay allowed. It's tested with `ESLint.lintText`, as in D-0060 §8.
3. **Prerequisite T-0319 (web-shell, about ½ day).** Dexie version 2 in `lib/offline/db.ts`, filled by `refreshAll()` and refetched after a flush that sent rows (AC-C17). All of it is per user, like v1:
   - **`exerciseDetails`:** `{id, instructions, mistakes, cue, source, license, attribution, sourceUrl}`, taken from the `exercises` select that `refreshLibrary` already runs. Plus `variants`, from `exercise_variants`. `loadExerciseDetail(id)` returns `null` for an unknown id. `loadVariants(id)` returns the variant ids sorted by id.
   - **`sessionCache`:** `sessions` rows with `started_at` ≥ the start of local day `today − 55` (the same 56-day window as history). `loadSessions()` returns server rows ∪ queued sessions, with the queued row winning by `id`, as `{id, startedAt, endedAt, timeBudgetMin, effortRating, energy}`.
   - **`checkinCache`:** every `plan_checkins` row. `loadCheckins()` maps them to the `PlanCheckin` shape.
   - **`routineCache`:** `routines` + `routine_items`. `loadRoutines()` returns `[{id, name, updatedAt, items: [{position, exerciseId}]}]` with the items sorted by position.
   - Offline, every loader returns the cache with no network call awaited.
   - No write helpers: the plan, check-in and routine writes are online-only supabase-js calls made by the features (D-0070).
4. **Cross-flow seams.** A feature may import another feature's **exported component** only through that feature's `index.tsx`. The seams are:
   - `features/UF-04` exports `ExerciseHowTo` (T-0306a). UF-03.1 uses it now, and UF-09.9 can use it later.
   - `features/UF-05` exports `SwapSheet` (T-0306b). UF-03.1, UF-09.9 and UF-09.6 use it.
   - `features/UF-11` exports `CheckinCard` (T-0308c). UF-02.1 and UF-11.2 use it.
   - A child that mounts a seam in another flow's screen lists the one file it edits as an explicit extra path, and runs after that flow's ticket (the dependency is on the board).
5. **The session state seam with T-0304.** T-0305a and T-0306b render inside the UF-09 host that T-0304 builds. They use whatever session-state hook and logging calls T-0304 exposes (plan, current item and set, logged sets, the rest timer). They never write IndexedDB any other way than through `lib/offline` (`recordSet`/`editSet`/`deleteSet`/`upsertSession`). Their AC fixtures build that state directly, so the ACs don't depend on T-0304's internals.

## Consequences
- The orchestrator replaces the four board rows with the child rows and adds T-0318 and T-0319 (web-shell, run one after the other, per the no-parallel rule for web-shell) and T-0223 (data, D-0070 §6). The product-owner writes the T-0318 and T-0319 ticket files from §2–§3 at the next groom. This groom was limited to T-0305–T-0308.
- After T-0318, the feature children don't overlap in paths and can run in parallel (cap 5), subject to their other dependencies.
- The other Phase 3 groomer (T-0301–T-0304) should use the same per-flow string files and seams. That groom is running in parallel, so the orchestrator reconciles the two.

## Revisit when
- Design delivers a C-02 or navigation spec that moves Routines or Balance into their own tab.
- A second feature needs a Dexie table. Then `lib/offline` gets a general per-feature cache API instead of a new version bump each time.
