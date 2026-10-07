# Excluded exercises — spec

- **Idea:** the owner, 2026-10-06: "As a user, I would like to exclude some exercises and manage my excluded exercises."
- **Screens:** new UF-11.5 Excluded exercises. Changes on UF-04.1, UF-04.2, UF-05.1, UF-08.2, UF-08.3 and UF-11.2. User flows v2 (D-0002).
- **Decisions:** D-0199 (this feature, amended in check mode 2026-10-07: release order §11, notice §8, empty states §9, design prerequisite §10). Also D-0130 (rule 12 signature guards), D-0186 (human-run prod releases), D-0071 §3 §8 §9 (hand-offs, device engine, import bans). Builds on D-0024 (eligibility), D-0059 (excludeIds in the shuffle pool; "rankSwaps gains an excludeIds input"), D-0191 (Skip today, Remove without refill), D-0195 (sign-out clears this user's caches), D-0136 (export), D-0197 (an authenticated empty read replaces the cache).
- **Principles:** 3, deterministic engine: an exclusion is an engine input (`sessionInput.excludeIds`, `rankSwaps` `excludeIds`), never a UI-side filter on engine output. 1, one task on screen: nothing is added to UF-09 itself; the only in-workout entry is the swap sheet behind Pause. 5, onboarding: untouched.

## What it is
A durable, per-user "never suggest this" list. An excluded exercise is never picked by `suggest` (main lift, pinned, greedy, shuffle) and never offered by `rankSwaps`, on any device, until the user includes it again. It is not hidden anywhere else: the library, history, balance and finished workouts show it as before, and its past sets still count toward the 14-day load.

The per-visit `excludeIds` of UF-08.2 Remove (D-0191 §4) stays as it is, and stays separate: the UF-08 setup record keeps only this visit's Removes. The union is built at each engine call and never stored: `excludeIds = sorted(dedupe(stored list ∪ ids removed on this UF-08 visit))`. So an Include again, or a change from another device, is picked up by the next re-suggest.

Every `suggest` caller passes it: UF-08.2 (first suggest, Shuffle, time chips), the UF-08.1 fit line, and the UF-02.1 card / UF-02.2 preview (stored list only, no visit). Every `rankSwaps` caller (the swap sheet, UF-05.1 and UF-08.3) passes the stored list.

## Where the user excludes an exercise
| Screen | Control | Notes |
|---|---|---|
| UF-04.2 Exercise detail | "Don't suggest this" (secondary button). When excluded, the screen shows "Not suggested" and "Suggest again". | The calm place to decide. |
| UF-08.2 Suggested | After Remove, a "Removed" line at the end of the list: one row per item removed on this visit, "{name} · Never suggest". After the tap: "{name} won't be suggested · Undo". | Remove stays one tap (D-0191). The line has no timeout (WCAG 2.2.1). It goes when the user leaves UF-08. |
| UF-08.3 Swap before starting | Checkbox "Don't suggest {current name} again", unchecked by default, applied when the swap is confirmed. | Sits next to "Always use this in <routine>". |
| UF-05.1 Swap sheet (in workout) | The same checkbox, applied when the swap is confirmed. | Reached from UF-09.9 and UF-09.6 only. Nothing new on the UF-09 screens themselves. |
| UF-11.5 Excluded exercises | Search the library, then "Exclude" on a result. | See below. |

There is no exclusion control on UF-09.1–UF-09.9, UF-03, UF-01 or UF-02.

## Where the user manages the list: UF-11.5 Excluded exercises
- **Entry:** a row on UF-11.2 Plan under the priority areas: "Excluded exercises · {n}" ("none" when 0), linking to `/plan/excluded`. Never reachable from UF-03, UF-08 or UF-09.
- **Header:** "Excluded exercises", with one line: "These are never suggested or offered as a swap. Your past sets still count."
- **Search field** "Search exercises". It matches a case-insensitive substring of the exercise name over every library row of kind `exercise` (any level or equipment). Warm-up moves never appear.
- **Empty query:** the excluded list sorted by name (then id). Each row shows the name, the primary areas, "Excluded {d MMM}" and **Include again**.
- **With a query:** the matching exercises sorted by name (then id). Excluded rows show "Excluded" and **Include again**. Other rows show **Exclude**.
- **Zero exclusions, empty query:** "No excluded exercises. Search to exclude one, or tap Remove on a suggested workout."
- **With a query and no match:** "No exercises match “{query}”."
- **Areas left without an exercise:** when the engine's `excludedOutAreas` (rule 0.1) is not empty, a standing neutral notice at the top (`surface-2`, `line` border, `text-muted`, info icon; **not** `warn`, which the design system reserves for PRs, warm-up, rest, over time and the C-01 attention outline): "Not suggested: {areas}. Every exercise for them is excluded." With one area: "Not suggested: {area}. Every exercise for it is excluded." Areas use their labels, in the fixed order, joined with ", ". UF-08.2 shows the same notice, from the same stored list (D-0199 §8). No confirm dialog; excluding the last exercise for an area is allowed (a default the human may override).

## Engine (D-0199 §3, rule 0.1)
- `suggest` already removes `sessionInput.excludeIds` from the eligible pool (rule 0). That covers the main lift (an excluded `mainLiftId` is ignored), `pinnedIds` (an excluded pinned id is skipped), greedy picks and the rule 13 shuffle (D-0059 (b)).
- `rankSwaps` gains a trailing optional `excludeIds: readonly string[] = []`: rule 12's signature line becomes `rankSwaps(current, reason | null, session, profile, library, history, now, tz, excludeIds = [])`. Candidates are filtered at pool level (`isEligible(e, profile, excludeIds)`), before ranking and before the `equipment_taken` keep-all fallback, so the fallback never brings an excluded exercise back. `[]` gives a result deep-equal to the call without it. `current` may itself be excluded; that is not an error.
- The rule 12 guards (T-0204, T-0224, via `rule12-guards.ts`) accept exactly that one line through a new fixture `rule12-signature-d0199.ts`, and the T-0212 signature test moves to the new line and 9 parameters (D-0199 §3). The new rule 12 examples go after the R12-E5 line.
- New pure function `excludedOutAreas(profile: Pick<EngineProfile, "level" | "equipment">, library, excludeIds): Area[]`, exported: the areas, in the fixed order, that have at least one eligible exercise at weight 1.0 with `excludeIds = []` and none with `excludeIds`. Areas that the profile's equipment or level already leaves empty are not reported. Unknown ids, duplicates and order are ignored.
- `applySwap`, `removeItem`, `timeCheck`, `balance`, `evaluateCheckin` and `prefill` take no exclusions.
- **Empty pool:** an area with no candidate is exhausted (rule 7.2, unchanged). The engine does not fall back to an excluded exercise: "never" means never. The freed time is filled from other areas, or stays unused. If no compound is left anywhere, `mainLiftId` is null (rule 7.2, unchanged).
- The engine ticket regenerates `supabase/functions/_shared/vendor/engine/**`.

## Empty states (D-0199 §9)
- **UF-08.2, 0 items not caused by Remove:** the existing "Nothing fits in {n} min", with the area notice above it when it applies. Remove emptying the plan keeps D-0191 §5's "No exercises left. Pick a time to rebuild."
- **Swap sheet (UF-05.1, UF-08.3), 0 candidates:** if `rankSwaps` with `excludeIds = []` returns candidates, "No alternatives left. The others are excluded."; otherwise the existing "No alternatives fit your equipment".

## Data (D-0199 §4)
New user-owned table `excluded_exercises`: `user_id` (default `auth.uid()`, FK `auth.users` on delete cascade), `exercise_id` (FK `exercises(id)` on delete cascade), `created_at` (default `now()`, and server-set by the trigger `private.excluded_exercises_before_write`: a client value is ignored on insert, and an update can't change `created_at` or `user_id`). PK `(user_id, exercise_id)`, index on `exercise_id`. Owner-only RLS (four policies, D-0020), no `anon` privileges. Exclude is `upsert(…, {onConflict: "user_id,exercise_id", ignoreDuplicates: true})`, so a double tap or a second device is not an error. Include again is a delete, and deleting a missing row is not an error.

The `exercises` FK cascades, unlike `session_sets` and `routine_items` (no action): an exclusion is a preference, not history. `docs/data-model.md` says so.

The export (UF-11.4, D-0136) gains an 8th table key, `excluded_exercises`, paged and ordered by `exercise_id`; `version` stays 1. Account deletion removes the rows through the cascade. The drift guards change in the same data ticket: pgTAP `001_schema`, `018_user_owned_tables` (`OWNED_TABLES`), `007_account_deletion`; and in the web-shell ticket, `EXPORT_TABLES` and `ORDER_KEYS` in `lib/account/export.ts`.

The device cache is a Dexie table keyed or indexed by `userId`, so sign-out (D-0195) and the account wipe (D-0136 §5) clear it with every other cache. A read error, including a missing table (PostgREST `PGRST205` or HTTP 404), keeps the cache and is never an empty read.

**Release order (D-0199 §11):** the migration is released to prod (human-run `infra/scripts/supabase-prod-release.sh`) before the first web ticket that reads or writes the table merges, because `main` deploys to prod on green CI.

## Edge cases
- **Offline:** the list is read from this user's cache, so offline suggestions and swap lists honour it (NFR-OFF-3). Every control that changes the list (UF-04.2, UF-08.2 "Never suggest", the UF-08.3 and UF-05.1 checkbox, UF-11.5 Exclude and Include again) is disabled offline with "Connect to change excluded exercises". The swap itself still works offline. When the connection returns, the controls are enabled without a reload. There is no offline queue for exclusions in v1.
- **Write fails online:** the list is unchanged, "Couldn't save. Try again." is shown, and the control is enabled again. The cache changes only after the server confirms.
- **Zero history:** works the same; exclusions don't depend on history.
- **Returning after 10 days off:** exclusions never expire. The stored list is read again on app start, so a change made on another device shows up.
- **Time running out:** not applicable; nothing in UF-09.8 changes. An exclusion made in UF-05.1 mid-workout changes only the swap being confirmed and future suggestions, never the rest of the running plan.
- **Workout in progress:** a plan that is already started keeps its items. Exclusions apply to the next `suggest` or swap list.
- **Excluded exercise in a routine (UF-07.1):** exclusion wins in suggestions (the engine drops it from `pinnedIds`). The routine row stays as written. No "Not suggested" tag in UF-07.1 in v1 (a default the human may override, D-0199).
- **A library row is removed:** the FK cascade removes the exclusion. A stale id in a cached list is ignored by the engine.
- **Sign out:** the cached list is this user's data and is cleared with the other caches (D-0195).
- **Every exercise for an area excluded:** see "Areas left without an exercise" above, and the UF-08.2 line in AC9. UF-10 still shows the area's deficit and attention, unchanged.

## Acceptance criteria (each one is at least one automated test)
Fixtures: the engine-rules fixtures (F-tz, F-profile, F-input, L1, F-history empty) unless stated. UI tests use the L1 library as a fixture, with each name being the id in sentence case and "db-" written as "Dumbbell" (bench-press "Bench press", db-bench-press "Dumbbell bench press", lateral-raise "Lateral raise"), not the real library, whose ids differ (barbell-bench-press). "Online" means the Supabase client resolves; "offline" means `navigator.onLine` is false.

- **AC1 (engine: suggest)** Given the R7-E4 inputs with `excludeIds` [bench-press], When `suggest` runs, Then the items are db-bench-press × 4 (main), inverted-row × 3, leg-extension × 2, 1545 s, `unusedS` 75 (R7-E17). With `mainLiftId` bench-press as well, Then the result is the same (R7-E18).
- **AC2 (engine: area emptied)** Given the R7-E4 inputs with `excludeIds` [back-squat, leg-extension], Then the items are bench-press × 4 (main), inverted-row × 3, leg-curl × 2 (1545 s, `unusedS` 75), and no item has quads at weight 1.0 (R7-E20).
- **AC3 (engine: pinned)** Given `pinnedIds` [plank] and `excludeIds` [plank], Then plank is not an item, and the result is deep-equal to `pinnedIds` [] with the same `excludeIds` (R7-E19).
- **AC4 (engine: swaps)** Given the R12-E1 fixture and `excludeIds` [db-row], When `rankSwaps` runs, Then the candidates are inverted-row (bestMatch), lat-pulldown, seated-cable-row, straight-arm-pulldown. With `excludeIds` [], Then the result is deep-equal to the 8-argument call. With `excludeIds` [barbell-row] (the current exercise), Then it does not throw and equals R12-E1 (R12-E17).
- **AC5 (engine: excludedOutAreas)** Given F-profile and `excludeIds` [calf-raise], Then `excludedOutAreas` is [calves]. Given [bench-press, db-bench-press], Then it is [] (push-up still covers chest). Given equipment [] and [push-up], Then it is [chest] (back, already empty by equipment, is not reported). Given [] or an unknown id, Then it is [] (R0-E3…E5).
- **AC6 (data)** Given user A has excluded bench-press, When user B selects, inserts, updates or deletes rows of `excluded_exercises` for A, Then B sees no rows and every write fails or changes nothing. When A inserts bench-press again, Then there is still one row and no error. When A's auth user is deleted, Then A's rows are gone.
- **AC7 (UF-04.2)** Given the user is online and bench-press is not excluded, When they tap "Don't suggest this" on UF-04.2 for bench-press, Then a row (A, bench-press) exists, the screen shows "Not suggested" and "Suggest again", and UF-04.1 shows bench-press with the "Not suggested" tag. When they tap "Suggest again", Then the row is gone and the tag too.
- **AC8 (UF-08.2 Remove → Never suggest)** Given UF-08.2 shows leg-extension and the user is online, When they tap Remove on leg-extension, Then the "Removed" line shows "Leg extension · Never suggest". When they tap Never suggest, Then (A, leg-extension) is stored and the line reads "Leg extension won't be suggested · Undo". When they tap Undo, Then the row is gone and the line shows "Never suggest" again. When they leave UF-08 and Start again, Then leg-extension is not in UF-08.2 while it is excluded.
- **AC9 (UF-08.2 area notice)** Given the stored list is [back-squat, leg-extension] (L1 library, F-profile), When UF-08.2 renders, Then it shows the neutral notice "Not suggested: Quads. Every exercise for it is excluded." and no item has quads at weight 1.0. Given an empty list, Then the notice is absent. Given an empty stored list and the user removes every quads exercise on this visit, Then the notice is absent (it reads the stored list only).
- **AC10 (stored list reaches suggest)** Given the stored list is [bench-press] and the user removes inverted-row on this visit, When the user taps the 45-min chip, Then `suggest` is called with `excludeIds` exactly [bench-press, inverted-row] (sorted, no duplicates), and neither is an item. When bench-press is included again on another screen and the user taps a time chip, Then `excludeIds` is [inverted-row].
- **AC10a (other suggest callers)** Given the stored list is [bench-press], When the UF-08.1 fit line computes, and When the UF-02.1 card / UF-02.2 preview computes, Then each `suggest` call has `excludeIds` [bench-press]. The T-0303a AC-6 test that pins `excludeIds: []` changes to pin the stored list (`[]` when the list is empty).
- **AC10b (empty states)** Given every candidate for barbell-row's slot is excluded, When the swap sheet opens, Then it shows "No alternatives left. The others are excluded."; given no candidate even with `excludeIds` [], Then "No alternatives fit your equipment". Given exclusions leave `suggest` with 0 items and no Remove happened, Then UF-08.2 shows "Nothing fits in {n} min" with the area notice.
- **AC11 (swap checkbox)** Given UF-05.1 is open for barbell-row and the user is online, When they choose lat-pulldown with "Don't suggest Barbell row again" ticked, Then the swap is applied and (A, barbell-row) is stored. With the box unticked, Then nothing is stored. The same holds on UF-08.3. Given the stored list contains db-row, Then db-row is not in the UF-05.1 or UF-08.3 list.
- **AC12 (UF-11.2 → UF-11.5 list)** Given the stored list is [lateral-raise (excluded 2026-10-01), bench-press (2026-10-03)], When UF-11.2 renders, Then it shows "Excluded exercises · 2". When the user opens it, Then UF-11.5 lists Bench press, then Lateral raise, each with primary areas, "Excluded 3 Oct" / "Excluded 1 Oct" and Include again. When they tap Include again on Bench press, Then the row is gone and UF-11.2 shows "Excluded exercises · 1".
- **AC13 (UF-11.5 search)** Given the stored list is [bench-press], When the user types "BENCH" on UF-11.5, Then the results are Bench press (Excluded, Include again) and Dumbbell bench press (Exclude), and no warm-up move appears. When they tap Exclude on Dumbbell bench press, Then it is stored and shows Include again.
- **AC14 (UF-11.5 empty and warning)** Given no exclusions, When UF-11.5 renders with an empty query, Then it shows "No excluded exercises. Search to exclude one, or tap Remove on a suggested workout." Given the query "zzz", Then it shows "No exercises match “zzz”." Given the stored list empties calves, Then the neutral notice "Not suggested: Calves. Every exercise for it is excluded." is shown, with the same text as on UF-08.2; given it empties calves and quads, Then "Not suggested: Quads, Calves. Every exercise for them is excluded."
- **AC15 (offline)** Given the stored list is [bench-press] cached and the device is offline, When the user builds a suggestion on UF-08.2, Then bench-press is not an item. On UF-04.2, UF-11.5 and in the UF-05.1 / UF-08.3 checkbox and the UF-08.2 "Never suggest" control, the controls are disabled with "Connect to change excluded exercises". When the connection returns, Then they are enabled without a reload.
- **AC16 (write failure)** Given the insert fails online, When the user taps Exclude on UF-11.5, Then the list is unchanged, "Couldn't save. Try again." is shown, and Exclude is enabled again.
- **AC17 (export and sign-out)** Given the stored list is [bench-press], When the user exports their data on UF-11.4, Then the file has an `excluded_exercises` table with that row. When they sign out, Then the cached list is gone from the device.
- **AC18 (other devices)** Given device 1 excluded bench-press, When device 2 starts the app online, Then device 2's cached list contains bench-press before its first suggestion.
- **AC19 (missing table)** Given the cached list is [bench-press] and the read fails with `PGRST205` (or HTTP 404), When the app refreshes, Then the cached list is still [bench-press]. Given an authenticated read returns [], Then the cache is emptied (D-0197 §2).
- **AC20 (server-set created_at)** Given A inserts bench-press with `created_at` 2020-01-01, Then the stored `created_at` is the server's `now()`. When A updates the row's `created_at` or `user_id`, Then both keep their old values.
- **AC21 (exercise cascade and export order)** Given A excluded bench-press, When the bench-press library row is deleted (as `postgres`), Then A's exclusion is gone. Given A excluded lateral-raise then bench-press, When A exports, Then `tables.excluded_exercises` lists bench-press before lateral-raise.

Engine examples and properties beyond AC1–AC5 (R12-E18, R12-E19, the three simulated 14-day histories, the fast-check properties) are listed in D-0199 §3.

Design acceptance (the design ticket, before any UI ticket): a checkbox component spec (native input in its label, 24 px box in a 44 px row, ≥ 3:1 border contrast) and screen specs for UF-11.5, UF-08.2, UF-08.3 / UF-05.1, UF-04.1 / UF-04.2 and UF-11.2; the notice uses neutral tokens only, no hex and no new token; every new control is ≥ 44 px; the Removed line is a `role="status"` present on mount and focus stays on it after Undo; offline controls use `aria-disabled` plus one `aria-describedby` "Connect to change excluded exercises" per screen; "Couldn't save. Try again." is `role="alert"`; labels "Exclude {name}" / "Include {name} again" are unique; the UF-04.1 tag is text, never colour only; no new UF-09 control.

## Out of scope (v1)
- Excluding a whole area permanently (Skip today covers one workout, D-0191).
- Temporary exclusions with an expiry ("not for 2 weeks").
- An offline queue for exclusion writes.
- A UF-07.1 "Not suggested" tag on routine rows.
- Exclusions in onboarding.
