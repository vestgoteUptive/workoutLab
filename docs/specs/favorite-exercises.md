# Favorite exercises — spec

- **Idea:** the owner, GitHub #46 "Favorite exercises" (2026-10-07): "I always want to do squats with barbell [on leg days] … these are basic and foundational exercises … I would like to have a favorite exercise for each area."
- **Screens:** new UF-11.6 Favorite exercises. Changes on UF-04.1, UF-04.2, UF-08.2 and UF-11.2. User flows v2 (D-0002).
- **Decisions:** D-0202 (this feature). Builds on D-0199 (excluded exercises, the mirror feature: same table shape, cache, management screen and UF-04.2 entry), D-0200 §1 (export lives in the data ticket), D-0201 (automatic prod release and its migration guard), D-0024/D-0025 (eligibility, ranking), D-0191 (avoided areas, toggle chips), D-0195 and D-0136 (sign-out, wipe, export), D-0197 (an authenticated empty read replaces the cache), D-0071 §3 §8 §9 (device engine, no cross-feature imports).
- **Principles:** 3, deterministic engine: a favorite is an engine input (`sessionInput.favoriteIds`) that changes one ranking key, never a UI-side reordering of engine output. 2 and 4: a favorite never bypasses recovery, avoided areas, equipment, level or the time fit, and never decides which area is trained. 1: nothing on UF-09. 5: nothing in onboarding.

## What it is
A durable, per-user list of favorite exercises. When the engine trains an area, a favorite with weight 1.0 in that area is tried **first** among that area's candidates. Gaps still choose the areas; recovery, Skip today, equipment, level and the time left still filter and fit as before. A favorite is a preference, not a promise: if it doesn't fit, it isn't in the plan.

How the four exercise-level inputs compose:

| Input | Set where | Effect |
|---|---|---|
| `mainLiftId` | explicit choice (routine, later) | is the main lift if eligible |
| `pinnedIds` | UF-07/UF-08.3 "Always use this in <routine>" | placed whatever the gaps say, if it fits |
| `favoriteIds` | UF-04.2, UF-11.6 (this spec) | ranked first **inside** an area the gaps chose |
| `excludeIds` | UF-04.2, UF-08.2, swap sheet, UF-11.5 (D-0199) | never picked; beats all of the above |

A favorite and an exclusion are mutually exclusive: adding one removes the other, on the server (triggers) and on the device.

## Where the user sets favorites
| Screen | Control | Notes |
|---|---|---|
| UF-04.2 Exercise detail | "Favorite" toggle (`aria-pressed`, label "Favorite {name}", star icon plus the word, never icon only), beside "Don't suggest this" (D-0199). | Favoriting an excluded exercise includes it again; "Don't suggest this" on a favorite removes the favorite. One `role="status"` line says so (below). |
| UF-04.1 Browse | "Favorite" text tag on the row. | Display only. |
| UF-11.6 Favorite exercises | Search the library, then "Add" on a result; "Remove" on a favorite. | See below. |
| UF-08.2 Suggested | "Favorite" text tag on an item whose exercise is a favorite. | Display only; no control. |

Nothing is added to UF-09.1–.9, UF-05.1, UF-08.3, UF-07, UF-03 or UF-01.

Move lines (`role="status"`, present on mount, empty until used):
- Favorite on an excluded exercise: "{name} is a favorite and will be suggested again."
- Don't suggest this (or Exclude on UF-11.5) on a favorite: "{name} won't be suggested. Removed from favorites."

## Where the user manages the list: UF-11.6 Favorite exercises
- **Entry:** a row on UF-11.2 Plan, directly above "Excluded exercises · n": "Favorite exercises · {n}" ("none" at 0), linking to `/plan/favorites`. Never reachable from UF-03, UF-08 or UF-09.
- **Header:** "Favorite exercises", with one line: "When a workout trains one of these areas, your favorites come first. Recovery, equipment and your time still decide."
- **Search field** "Search exercises": a case-insensitive substring of the name over every library row of kind `exercise` (any level or equipment), sorted by name then id. Warm-up moves never appear. Each result shows its primary areas and either **Add** (label "Add {name} to favorites") or "Favorite" with **Remove** (label "Remove {name} from favorites"). An excluded result also shows "Excluded"; Add on it moves it (move line above).
- **Empty query:** the favorites grouped by area, in the fixed area order, showing only areas that have a favorite. An exercise appears under each area where it has weight 1.0 (back-squat under Glutes and Quads). Inside an area: by name, then id. Each row: the name, **Remove**, and, when the engine can't use it, one text line:
  - "Not available with your equipment" when `isEligible(e, {...profile, level: "advanced"}, [])` is false;
  - otherwise "Above your level" when `isEligible(e, profile, [])` is false.
  (`isEligible` is the engine's exported rule 0 test, so the screen states the engine's view.)
- **Zero favorites, empty query:** "No favorites yet. Search to add one, or tap Favorite on an exercise."
- **Query with no match:** "No exercises match “{query}”."

## Engine (D-0202 §3; engine lane writes it into `docs/engine-rules.md`)
- **Rule 0:** `sessionInput` gains the optional `favoriteIds` (absent means `[]`).
- **New rule 0.2 Favorite exercises:** a favorite is ranked first among an area's candidates; it never chooses the area and never bypasses a filter or the fit check. Precedence: `excludeIds` > `mainLiftId` > `pinnedIds` (step 2, unchanged) > `favoriteIds` > the existing ranking. Duplicates, order and unknown ids in `favoriteIds` have no effect.
- **Rule 7.2 ranking:** candidates are ranked by **(0) in `favoriteIds` first**; (1) not in the most recent session with hard sets first; (2) gap fit descending; (3) id ascending. Equivalently, the ranked list is the stable partition of today's list, favorites first. Step 1 ("the top compound candidate" of the lowest-`r` area) therefore picks a favorite compound when the gaps choose its area.
- **Unchanged:** `rankSwaps` (rule 12 and its guarded slice), shuffle (rule 13), `excludedOutAreas`, `applySwap`, `removeItem`, `timeCheck`, `balance`, `evaluateCheckin`, `prefill`, reason codes (rule 10).
- **Examples** (F-tz, F-profile, L1, F-history empty, the R7-E4 inputs unless stated; the engine ticket checks each against the code before encoding it, and a disagreement goes to triage with the derivation):
  - **R7-E21 (time wins)** `favoriteIds` [back-squat]: deep-equal to R7-E4. back-squat × 2 (390 s) doesn't fit the 345 s left when glutes and quads come up, so leg-extension × 2 is still picked.
  - **R7-E22 (favorite main lift)** [db-bench-press]: db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2; item total 1545 s, `unusedS` 75.
  - **R7-E23 (favorite changes later areas)** [barbell-row]: bench-press × 4 (main), barbell-row × 3, dead-bug × 2; 1545 s, `unusedS` 75. barbell-row adds no core load (inverted-row did), so core is the next zero-`r` area; dead-bug × 3 (375 s) doesn't fit 345 s, × 2 (270 s) does, and dead-bug wins the core tie by id.
  - **R7-E24 (favorite beats "not in the last session")** R7-E7 with [inverted-row]: the back ranking is inverted-row, barbell-row, db-row, lat-pulldown, seated-cable-row, straight-arm-pulldown.
  - **R7-E25 (recovery wins)** R7-E3 with [back-squat]: deep-equal to R7-E3.
  - **R7-E26 (explicit and exclusion win)** [db-bench-press] with `mainLiftId` bench-press: deep-equal to R7-E4. [db-bench-press] with `excludeIds` [db-bench-press]: deep-equal to R7-E4.
  - **R7-E27 (favorite picks the main lift inside the chosen area)** `avoidAreas` [chest, back, shoulders, arms, core] with [hip-thrust]: hip-thrust × 4 (main), back-squat × 3, calf-raise × 2; 1545 s, `unusedS` 75. With `favoriteIds` [] the main lift is back-squat (higher gap fit).
  - **R7-E28…E30** the simulated 14-day histories balanced, all-chest-no-legs and returning-after-10-days, each with [back-squat]; derived and recorded by the engine ticket with the engine reviewer.
- **Properties (fast-check):** [] deep-equals absent over budgets 15..120, every energy, warm-up on/off and shuffle 0..6; invariance under permutation, duplication and unknown ids; R7-E8's caps hold for any favorite subset; an id in both lists is never an item and the result equals the call without it in `favoriteIds`; the stable-partition property on the candidate ranking.
- The engine ticket regenerates `supabase/functions/_shared/vendor/engine/**`.

## API (D-0202 §4)
`api/openapi.yaml` `SessionInput` gains the optional `favoriteIds: ExerciseId[]` (not required). The `/workouts/suggest` validator accepts it in a separate backend ticket; the web app suggests on the device (D-0071 §8), so that ticket is off the user path.

## Data (D-0202 §5)
New user-owned table `favorite_exercises`, the shape of `excluded_exercises`: `user_id` (default `auth.uid()`, FK `auth.users` on delete cascade), `exercise_id` (FK `exercises(id)` on delete cascade), `created_at` server-set by `private.favorite_exercises_before_write`. PK `(user_id, exercise_id)`, index on `exercise_id`, four owner policies (D-0020), no `anon` privileges. Add is `upsert(…, {onConflict: "user_id,exercise_id", ignoreDuplicates: true})`; Remove is a delete; both are idempotent.

Mutual exclusion: an `after insert` trigger on each table (security invoker) deletes the same `(user_id, exercise_id)` from the other table. The migration carries `-- release: destructive-approved D-0202`, because the D-0201 migration guard flags `delete from` inside function bodies; D-0202 approves exactly those trigger bodies.

Export (UF-11.4): a 9th key `favorite_exercises`, ordered by `exercise_id`; `version` stays 1. Account deletion removes the rows through the cascade.

Release (D-0201): CI releases the migration to prod before the Pages deploy of the same push. If T-0543 is not live when the data ticket merges, the D-0199 §11 order applies instead (a human release before any web ticket that reads the table merges).

## Device (D-0202 §6)
A Dexie table keyed by `userId` (version bump after T-0536's), read in `refreshAll` and on UF-11.6 mount, with D-0199 §5's cache rules: authenticated empty read replaces, read error (including `PGRST205`/404) keeps, writes land in the cache only after the server confirms, sign-out and the account wipe clear it. After a confirmed favorite the id also leaves the excluded cache, and after a confirmed exclusion it leaves the favorites cache. Every `suggest` caller (UF-08.2 first suggest, Shuffle and time chips; the UF-08.1 fit line; the UF-02.1/UF-02.2 preview) passes `favoriteIds` = the sorted, deduped stored list.

## Edge cases
- **Offline:** suggestions read the cached list (NFR-OFF-3). Every control that changes the list (UF-04.2 toggle, UF-11.6 Add and Remove) is disabled with "Connect to change favorites", and enabled again without a reload when the connection returns.
- **Write fails online:** the list is unchanged, "Couldn't save. Try again." (`role="alert"`), the control is enabled again.
- **Zero history:** favorites apply from the first suggestion (R7-E22).
- **Returning after 10 days off:** favorites never expire; rule 14 still pre-fills the favorite with `hold_after_break` or `reentry`. Another device's change arrives with the next `refreshAll`.
- **Time running out:** UF-09.8 is unchanged; Trim may cut a favorite accessory like any other (rule 8). On UF-08.2 a shorter time chip may drop a favorite that no longer fits (R7-E21).
- **Favorite area recovering or skipped today:** the favorite is not picked (R7-E25); nothing tells the user on UF-08.2 beyond the existing "Recovering" reason and "Skipping today" line.
- **Favorite needs equipment the user doesn't have / above their level:** never picked; UF-11.6 says why.
- **Every exercise in an area is a favorite:** same as none for that area (ties fall to the existing keys).
- **Favorite and excluded at once** (a race between two devices): the engine drops it (exclusion wins); the next write of either list fixes the rows.
- **Workout in progress:** the running plan keeps its items; favorites apply to the next `suggest`.
- **Sign out / delete account:** the cache is cleared; the rows go with the account (cascade).
- **A library row is removed:** the cascade removes the favorite; a stale cached id is ignored by the engine.

## Acceptance criteria (each one is at least one automated test)
Fixtures as in `docs/specs/excluded-exercises.md` (L1 library, names in sentence case, "db-" as "Dumbbell"; "online" means the Supabase client resolves, "offline" means `navigator.onLine` is false).

- **AC1 (engine: ranking)** Given R7-E4, R7-E7 and R7-E3 inputs with the favorites of R7-E21…E27, When `suggest` runs, Then each result is as listed in §Engine.
- **AC2 (engine: properties)** The properties in §Engine hold, and R7-E28…E30 hold.
- **AC3 (data)** Given user A has favorited back-squat, When user B selects, inserts, updates or deletes A's rows, Then B sees nothing and changes nothing. When A inserts back-squat again, Then there is one row and no error. When A's auth user is deleted, Then A's rows are gone. When the back-squat library row is deleted (as `postgres`), Then A's favorite is gone. A client `created_at` is ignored, and an update can't change `created_at` or `user_id`.
- **AC4 (data: mutual exclusion)** Given A excluded back-squat, When A favorites back-squat, Then A has a favorite row and no exclusion row. Given A favorited bench-press, When A excludes bench-press, Then A has an exclusion row and no favorite row. B's rows for the same exercise are untouched in both cases.
- **AC5 (export)** Given A favorited lateral-raise then bench-press, When A exports on UF-11.4, Then `tables.favorite_exercises` lists bench-press before lateral-raise.
- **AC6 (UF-04.2 toggle)** Given online and back-squat is not a favorite, When the user taps "Favorite" on UF-04.2, Then (A, back-squat) is stored, the toggle is pressed, and UF-04.1 shows the "Favorite" tag on Back squat. When tapped again, Then the row and the tag are gone.
- **AC7 (UF-04.2 moves)** Given back-squat is excluded, When the user taps "Favorite", Then it is a favorite, no longer excluded, "Not suggested" is gone and the status line reads "Back squat is a favorite and will be suggested again." Given bench-press is a favorite, When they tap "Don't suggest this", Then it is excluded, the toggle is not pressed and the line reads "Bench press won't be suggested. Removed from favorites."
- **AC8 (stored list reaches suggest)** Given the stored list is [db-bench-press, back-squat], When UF-08.2 builds, Shuffles or changes the time, and When the UF-08.1 fit line and the UF-02.1/UF-02.2 preview compute, Then every `suggest` call has `favoriteIds` exactly [back-squat, db-bench-press] (sorted, deduped), and with the R7-E4 inputs UF-08.2 shows Dumbbell bench press first with a "Favorite" tag.
- **AC9 (UF-11.2 → UF-11.6)** Given favorites [back-squat, lateral-raise], When UF-11.2 renders, Then it shows "Favorite exercises · 2" above "Excluded exercises · n". When opened, Then UF-11.6 shows Shoulders: Lateral raise; Glutes: Back squat; Quads: Back squat (fixed area order, areas without a favorite omitted). When the user taps Remove on Lateral raise, Then the Shoulders group is gone and UF-11.2 shows "Favorite exercises · 1".
- **AC10 (UF-11.6 search)** Given back-squat is a favorite and bench-press is excluded, When the user types "BENCH", Then the results are Bench press ("Excluded", Add) and Dumbbell bench press (Add); no warm-up move appears. When they tap Add on Bench press, Then it is a favorite and no longer excluded, with the move line.
- **AC11 (UF-11.6 status lines and empty states)** Given F-profile with equipment [] and favorites [back-squat], Then the Back squat rows read "Not available with your equipment". Given level beginner, equipment full and favorite pull-up, Then "Above your level". Given no favorites and an empty query, Then "No favorites yet. Search to add one, or tap Favorite on an exercise."; given the query "zzz", Then "No exercises match “zzz”."
- **AC12 (offline)** Given favorites [db-bench-press] cached and offline, When the user builds UF-08.2 with the R7-E4 inputs, Then db-bench-press is the main lift. The UF-04.2 toggle and the UF-11.6 Add and Remove controls are disabled with "Connect to change favorites", and enabled without a reload when the connection returns.
- **AC13 (write failure)** Given the insert fails online, When the user taps Add on UF-11.6, Then the list is unchanged, "Couldn't save. Try again." is shown, and Add is enabled again.
- **AC14 (cache)** Given device 1 favorited back-squat, When device 2 starts online, Then its cache contains back-squat before the first suggestion. Given the read fails with `PGRST205` (or 404), Then the cache is kept; given an authenticated empty read, Then it is emptied. When the user signs out, Then the cache is gone. After a confirmed favorite of an excluded id, Then the id is in neither the server's nor the device's excluded list.

Design acceptance (the design ticket, before any UI ticket): screen specs for UF-11.6, the UF-04.2 "Favorite" toggle beside "Don't suggest this" (reusing the D-0191 toggle chip, ≥ 44 px, `aria-pressed`, icon plus text), the "Favorite" text tag on UF-04.1 and UF-08.2, and the UF-11.2 row; no new token, no hex; offline controls use `aria-disabled` plus one `aria-describedby` "Connect to change favorites" per screen; labels "Favorite {name}", "Add {name} to favorites" and "Remove {name} from favorites" are unique.

## Open questions (each with the default that ships)
1. **Favorite first, or after "not in the last session"?** Default: first (the issue says "always"). Revisit if users report too little variety.
2. **Should Shuffle keep favorites?** Default: no, Shuffle may rotate an accessory favorite away; the main lift is never shuffled.
3. **Favorites in the swap sheet** (UF-05.1/UF-08.3: a tag, a sort key or a "Make favorite" checkbox)? Default: none in v1; `rankSwaps` stays untouched.
4. **A cap per area?** Default: no cap.
5. **A favorite step in onboarding** (e.g. on UF-01.3)? Default: no (principle 5); UF-11.6 and UF-04.2 only.
6. **A favorite entry on UF-08.2** (a per-item star)? Default: no; UF-08.2 only shows the tag, to keep the item actions to swap and remove.
7. **One three-state control on UF-04.2** ("Favorite · Normal · Don't suggest") instead of two buttons? Default: two controls, so T-0541 (D-0199) needs no rework; revisit after both ship.
8. **Tell the user when a favorite was skipped** (recovering, didn't fit)? Default: no extra copy; the existing reasons and the time bar explain it.

## Out of scope (v1)
- Per-area favorites that differ from the exercise's own areas (a favorite counts in each weight-1.0 area).
- Favorites forcing an area or an exercise into every workout (that is a routine pin, UF-07).
- Favorites in `rankSwaps`, shuffle, UF-09, UF-07 or onboarding.
- An offline queue for favorite writes.
