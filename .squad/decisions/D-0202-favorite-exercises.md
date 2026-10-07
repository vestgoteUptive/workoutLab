---
id: D-0202
title: "Favorite exercises (GitHub #46): a durable per-user favorites list in a new favorite_exercises table, fed to suggest as the optional sessionInput.favoriteIds; a soft preference only (rule 7.2 gets one new first ranking key, favorites first among an area's candidates), never a hard pick; several per area; mutually exclusive with excluded exercises (server triggers, exclusion wins in the engine); set on UF-04.2 and managed on new UF-11.6; rankSwaps, shuffle and UF-09 unchanged"
status: decided
date: 2026-10-07
by: product-owner (idea intake, GitHub #46)
area: product
builds-on: D-0002, D-0020, D-0024, D-0025, D-0037, D-0071, D-0136, D-0191, D-0195, D-0197, D-0199, D-0200, D-0201
amends: D-0199 §1 §4 (an exclusion now also removes the same exercise from favorites; a trigger is added to excluded_exercises), D-0136 §2 (export tables gain favorite_exercises)
---
## Context
The owner, GitHub #46 "Favorite exercises": "I always want to do squats with barbell [on leg days]
… these are basic and foundational exercises … I would like to have a favorite exercise for each
area." Full spec and ACs: `docs/specs/favorite-exercises.md`.

Today the engine knows three exercise-level inputs: `mainLiftId` (one explicit main lift),
`pinnedIds` (a routine's "Always use this in <routine>", placed whatever the gaps say) and
`excludeIds` (never pick, D-0199). Rule 7.2 picks the main lift from the lowest-`r` area and fills
the rest greedily; inside an area candidates are ranked by (1) not in the most recent session,
(2) gap fit, (3) id. So "back squat whenever I train legs" is not expressible: a pin forces the
exercise even on a day with no leg gap, and nothing makes the engine prefer it when it does pick
legs. The web app passes `pinnedIds: []` and `mainLiftId: null` today, so routines don't reach
the engine yet.

Favorites are the inverse of D-0199's excluded exercises, so they reuse its pattern: a user-owned
table, a device cache in `lib/`, a UF-11.x management screen reached from UF-11.2, and an entry on
UF-04.2.

## Decision
1. **What a favorite means: a soft preference, never a hard pick.** A favorite is an exercise
   (not an exercise-per-area pair). When the engine is choosing an exercise for an area in which
   the favorite has weight 1.0, the favorite is ranked **first** among that area's candidates.
   It never decides *which* area is trained (that stays gap-driven, rule 7.2), and it never
   bypasses a filter: an ineligible (equipment, level, excluded), recovering or avoided favorite
   is not a candidate, and a favorite that doesn't fit the time left is passed over exactly like
   any other candidate (principles 2 and 4). Why not a hard pick: forcing an exercise or an area
   regardless of the gaps is what a routine pin is for (UF-07), and it would override recovery
   and the time fit.
2. **Several per area, no cap.** A user may favorite any number of exercises; an exercise counts
   in every area where it has weight 1.0 (back-squat: quads and glutes). Ties among favorites
   fall to the existing keys (not in the last session, gap fit, id). The issue asks for "a
   favorite for each area"; one-per-area would force a replace dialog for no engine benefit.
3. **Engine (contract change named here, engine lane).** `docs/engine-rules.md`:
   - **Rule 0 session input** gains the optional `favoriteIds` (absent means `[]`), listed after
     `avoidAreas`.
   - **New rule 0.2 Favorite exercises** states §1 and the precedence below.
   - **Rule 7.2 candidate ranking** gains one key in front: "(0) in `favoriteIds` first". The rest
     of the ranking is unchanged. As a property: the ranked candidate list with favorites is the
     stable partition of the list without them (favorites first, each part in its old order).
     Because rule 7.2 step 1 takes "the top compound candidate" of the chosen area, a favorite
     compound becomes the main lift when its area is the lowest-`r` one.
   - **Precedence:** explicit `mainLiftId` > favorite (step 1 uses an eligible `mainLiftId` as
     today); `pinnedIds` are placed in step 2 as today (a pinned favorite is just pinned);
     **exclusion beats favorite** (an id in both lists is dropped by rule 0's eligibility test,
     so it is never picked).
   - **Unchanged:** `rankSwaps` (rule 12, so the D-0130/D-0199 guarded slice is untouched),
     shuffle (rule 13: an accessory favorite can be shuffled away because Shuffle is an explicit
     request for alternatives, and `n mod len` brings it back), `excludedOutAreas`, `applySwap`,
     `removeItem`, `timeCheck`, `balance`, `evaluateCheckin`, `prefill`, reasons (rule 10).
   - **Examples** R7-E21…E27 (spec §Engine; all at zero history on the R7-E4 inputs unless said):
     favorites [back-squat] → deep-equal to R7-E4 (the favorite doesn't fit; time wins);
     [db-bench-press] → db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2, 1545 s;
     [barbell-row] → bench-press × 4, barbell-row × 3, dead-bug × 2, 1545 s, `unusedS` 75;
     R7-E7 + [inverted-row] → inverted-row ranks first; R7-E3 + [back-squat] → deep-equal to R7-E3
     (recovery wins); [db-bench-press] with `mainLiftId` bench-press → deep-equal to R7-E4;
     [db-bench-press] with `excludeIds` [db-bench-press] → deep-equal to R7-E4; `avoidAreas`
     [chest, back, shoulders, arms, core] + [hip-thrust] → hip-thrust × 4 (main), back-squat × 3,
     calf-raise × 2, 1545 s, `unusedS` 75 (back-squat is the main lift without the favorite).
     The engine ticket checks every number against the code before it encodes it. A number that
     disagrees goes to triage with the derivation; it is not silently edited.
   - **Simulated 14-day histories** (required for engine changes): balanced,
     all-chest-no-legs and returning-after-10-days, each with `favoriteIds` [back-squat]; the
     engine ticket derives and records the expected items as R7-E28…E30 with the engine reviewer.
   - **Properties (fast-check):** `favoriteIds` [] deep-equals absent; invariance under
     permutation, duplication and unknown ids; R7-E8's budget, item and per-area caps hold for
     any favorite subset; an id in both `favoriteIds` and `excludeIds` is never an item, and the
     result equals the call with that id removed from `favoriteIds`; the stable-partition property
     above on the candidate ranking.
   - **Vendor.** The engine ticket regenerates `supabase/functions/_shared/vendor/engine/**`.
4. **API (contract change named here, data lane owns `api/openapi.yaml`).** `SessionInput` gains
   the optional `favoriteIds: ExerciseId[]` (not in `required`; absent means `[]`), so the
   `/workouts/suggest` validator (`additionalProperties: false`) accepts it. The backend validator
   change is a separate, off-the-user-path ticket (as T-0518 was for `avoidAreas`): the web app
   suggests on the device (D-0071 §8).
5. **Data (contract change named here, data lane).** New user-owned table `favorite_exercises`,
   the same shape as `excluded_exercises` (D-0199 §4): `user_id` default `auth.uid()`, FK
   `auth.users` on delete cascade; `exercise_id` FK `exercises(id)` on delete cascade;
   `created_at` server-set by `private.favorite_exercises_before_write`; PK
   `(user_id, exercise_id)`, index on `exercise_id`, four owner policies, no `anon` privileges.
   - **Mutual exclusion (amends D-0199 §4).** Two `after insert` triggers, `security invoker`
     (RLS applies; the deleted row is the caller's own): inserting into `favorite_exercises`
     deletes the same `(user_id, exercise_id)` from `excluded_exercises`, and inserting into
     `excluded_exercises` deletes it from `favorite_exercises`. No recursion (a delete fires no
     insert trigger). Two concurrent inserts from two devices can leave both rows; the engine's
     precedence (exclusion wins) makes that safe, and the next write of either fixes it.
   - **Release guard (D-0201 §3).** The trigger bodies contain `delete from`, which the migration
     guard flags even inside function bodies. The migration carries the header line
     `-- release: destructive-approved D-0202`. This decision approves exactly those two trigger
     bodies; nothing in the migration deletes data at release time.
   - **Export (amends D-0136 §2):** `tables` gains a 9th key `favorite_exercises`, paged and
     ordered by `exercise_id`; `version` stays 1. As D-0200 §1 found, the pgTAP 018 drift test
     ties `OWNED_TABLES` to `EXPORT_TABLES`, so the export change is in the data ticket.
   - Drift guards in the same ticket: pgTAP `001_schema`, `007_account_deletion`,
     `018_user_owned_tables`, plus a new file for the trigger, isolation, idempotence, both
     cascades and both mutual-exclusion directions. `database.gen.ts` is regenerated.
   - Not a `kind` column on `excluded_exercises`: T-0535 is reviewed and approved; reshaping it
     now costs a rework round for a structural guarantee the triggers already give.
6. **Device side (web-shell).** A Dexie table for the cached list keyed by `userId` (schema
   version bump after T-0536's), read on app start (`refreshAll`) and on UF-11.6 mount, with
   D-0199 §5's rules unchanged: an authenticated empty read replaces the cache, a read error
   (including `PGRST205`/404) keeps it, writes change the cache only after the server confirms,
   and sign-out and the account wipe clear it through their every-table loops. After a confirmed
   favorite write the client also drops the id from the excluded cache, and after a confirmed
   exclude it drops it from the favorites cache (mirroring §5's triggers). The T-0536 module
   should be generalised into one list-cache helper used by both lists rather than copied.
   **Every `suggest` caller passes `favoriteIds` = the sorted, deduped stored list**: UF-08.2
   (first suggest, Shuffle, time chips), the UF-08.1 fit line and the UF-02.1/UF-02.2 preview.
   `rankSwaps` callers pass nothing new.
7. **Offline and failures.** As D-0199 §6: reads come from the cache (NFR-OFF-3), so offline
   suggestions honour favorites; every control that changes the list is disabled offline
   (`aria-disabled`, "Connect to change favorites", once per screen); a failed write shows
   "Couldn't save. Try again." (`role="alert"`) and leaves the list unchanged.
8. **Screens (user flows v2, D-0002).**
   - **New UF-11.6 Favorite exercises** at `/plan/favorites`, from a UF-11.2 row
     "Favorite exercises · n" ("· none" at 0) placed directly above "Excluded exercises · n".
     Never reachable from UF-03, UF-08 or UF-09. Empty query: the favorites grouped by area in the
     fixed order (an exercise appears under each weight-1.0 area), only areas with a favorite.
     A search field like UF-11.5's. A row the engine can't use (engine `isEligible(e, profile,
     [])` is false) says why in text: "Not available with your equipment" or "Above your level".
   - **UF-04.2:** a "Favorite" toggle button (`aria-pressed`, label "Favorite {name}", icon plus
     text, never icon or colour only) beside D-0199's "Don't suggest this". **UF-04.1:** a
     "Favorite" text tag.
   - **UF-08.2:** a "Favorite" text tag on an item whose exercise is in the stored list
     (display only; the engine has already chosen).
   - **Nothing** on UF-09.1–.9 (principle 1), UF-05.1/UF-08.3 (v1), UF-07 or onboarding
     (principle 5).
9. **Moving between the lists is one tap.** Favoriting an excluded exercise makes it a favorite
   and includes it again; "Don't suggest this" on a favorite excludes it and removes the favorite.
   Each move shows one `role="status"` line: "{name} is a favorite and will be suggested again." /
   "{name} won't be suggested. Removed from favorites." No confirm dialog.
10. **Design prerequisite.** Before any UI ticket: screen specs for UF-11.6, the UF-04.2 toggle
    next to "Don't suggest this", the UF-04.1/UF-08.2 tag and the UF-11.2 row. No new token; the
    toggle reuses the Skip-today toggle chip pattern (D-0191).

## Defaults; human may override
- **No cap** on favorites per area or overall.
- **Favorite first beats "not in the last session"**: the issue says "always", so a favorite
  repeats every time its area is trained, at the cost of variety in that area only.
- **Shuffle may rotate an accessory favorite away** (an explicit user request); the main lift is
  never shuffled.
- **No swap-sheet entry or tag** (UF-05.1, UF-08.3) in v1.
- **No onboarding step** (principle 5).
- **Writes online-only**, no outbox (as D-0199).

## Consequences
- engine-rules gains rule 0.2, the `favoriteIds` input, one ranking key and the examples;
  openapi gains an optional `SessionInput.favoriteIds`; data-model gains `favorite_exercises`
  and the mutual-exclusion triggers. Design tokens are unchanged.
- Routines, once they reach the engine, compose cleanly: a routine's pin forces, a favorite
  prefers, an exclusion forbids.
- The orchestrator regenerates `.squad/decisions/INDEX.md`.

## Revisit when
- Users ask for "favorite but not every time" (then a weaker key after "not in the last session").
- Users ask for favorites in the swap sheet, or for Shuffle to keep favorites.
- Routines start feeding `pinnedIds`/`mainLiftId` (then decide whether UF-07.1 tags favorites).
- Prod releases stop running through the D-0201 guard (then §5's header is moot).
