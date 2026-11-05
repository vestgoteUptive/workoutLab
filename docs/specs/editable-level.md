# Editable training level — spec

- **Idea:** the owner, 2026-11-05: "Let users change their training level after onboarding." A real user who never consciously chose a level (UF-01.3 preselects Beginner, D-0064 §2) hit "Above your level" on UF-08.5 Add exercise and had no way out. Re-running onboarding doesn't help, because the existing profile wins (D-0064 §8).
- **Screens (user flows v2, D-0002):** UF-11.3 Edit plan (gains Level), UF-11.2 Plan ("Your plan" shows Level), UF-11.6 Favorite exercises (level notice with a link), UF-08.5 Add exercise (the "Above your level" line says where to change it), UF-01.3 Level & equipment (one hint line).
- **Decisions:** D-0230 (Level on UF-11.3, save semantics), D-0231 ("Above your level" lines and principle 1), D-0232 (onboarding keeps the Beginner preselect; amends D-0064 §2). Builds on D-0064, D-0070 §3 (Edit plan save), D-0081 (Edit plan draft), D-0199/D-0202/D-0205 (the existing "Excluded …" / "Above your level" lines), D-0020 (server-set `plan_changed_at`), D-0021/D-0030 (`profiles.level` vocabulary, not null, no default).
- **Principles:** 1: nothing is added to UF-09, and UF-08.5 gets text only, no link out of session setup. 2: untouched. 3: no engine change; `isEligible` (rule 0, level ≤ profile level) already reads `profile.level` on every call. 4: a level change never re-derives targets and never resets the check-in streak (level doesn't change targets in v1, rule 4). 5: onboarding keeps its 3-activation fastest path.

## User value
The level filter (rule 0) hides intermediate and advanced exercises from beginners. That is right for someone who is a beginner and wrong for anyone who accepted the preselect without thinking. Today the only fix is a new account. After this change the user can see their level on Plan, change it in Edit plan in two taps and a Save, and every place that says "Above your level" tells them where.

## Scope
1. **UF-11.3 Edit plan gains Level** (D-0230): a radiogroup "Training experience" with Beginner, Intermediate, Advanced, placed after Goal and before Rhythm. The labels and the hint for the selected level are the UF-01.3 ones ("Under 6 months. We start with form-first variations like the goblet squat." etc.). Initialised from `profiles.level` with the rest of the draft (D-0081 §2).
2. **Save semantics** (D-0230 §2):
   - **Level only changed:** one write, `profiles.update({ level })`. No `area_targets` upsert, no `plan_checkins` withdraw. The server trigger leaves `plan_changed_at` alone because `level` is not one of its four plan columns (data-model `profiles_before_write`), so the rule 9 streak is untouched. Then `refreshAll` and back (below).
   - **Goal, rhythm or priorities changed (with or without level):** today's three writes (D-0070 §3) unchanged, with `level` added to the `profiles` update.
   - The target preview doesn't change when only Level changes. Under the Level group, one line: "Level changes which exercises we suggest, not your targets."
3. **UF-11.2 Plan, "Your plan"** shows a Level fact between Goal and Rhythm: "Beginner" / "Intermediate" / "Advanced".
4. **UF-11.6 Favorite exercises** (D-0231 §2): when at least one favorite row has "Above your level", one notice under the header: "Your level is {Level}. Some favorites are above it." followed by a link **"Change level"** to `/plan/edit?from=favorites`. The per-row line stays "Above your level". Edit plan opened with `from=favorites` returns to `/plan/favorites` on Save and on Cancel; any other or missing `from` value returns to `/plan` as today.
5. **UF-08.5 Add exercise** (D-0231 §1): the line becomes "Above your level. Change it in Plan › Edit plan." Text only, no link, the same pattern as "Excluded. Include it again in Plan › Excluded exercises." (D-0205).
6. **UF-01.3** (D-0232): the Beginner/Intermediate/Advanced preselect stays Beginner. One static line under the level hint: "You can change this later in Plan." No new control, no new step.

## Where "Above your level" appears (audit, 2026-11-05)
| Screen | Today | After |
|---|---|---|
| UF-08.5 Add exercise (`SessionSetup.tsx`, `en.uf08.reasonLevel`) | "Above your level", row disabled | "Above your level. Change it in Plan › Edit plan." (no link) |
| UF-11.6 Favorite exercises (`FavoritesBody.tsx`, `en.uf11…aboveLevel`) | "Above your level" on the row | unchanged row line + one notice with "Change level" link |
| UF-05.1 / UF-08.3 Swap (rule 12 `rankSwaps`) | ineligible exercises are filtered out, no line | unchanged |
| UF-04 Library ("Suitable for me" filter, level tag on UF-04.2) | filter uses `isEligible`; tag shows the exercise's level | unchanged (non-goal) |
| UF-09.* | none | none |

## Behaviour and edge cases
- **Offline:** Save on UF-11.3 is already disabled offline with "Connect to save" (uf-11 spec, edge cases); that covers Level. The UF-11.6 "Change level" link still navigates (Edit plan renders from cache, Save disabled). UF-08.5's line is static text, so it works offline as today.
- **A workout in progress:** `sessions.plan` is written at Start (UF-08.4) and is never re-suggested, so a level change made in another tab or device doesn't change the running workout, its swaps already offered, or its pre-fills. The next UF-08 visit uses the new level. `/session/:sessionId` stays ungated (D-0064 §9).
- **A UF-08 visit in progress:** UF-08 holds no stored plan before Start (D-0109); leaving UF-08 for Plan discards the visit record, as any navigation does. That is why UF-08.5 has no link (D-0231). After a level change, the next "Suggest my workout" reads the refreshed cached profile.
- **Pinned and favorited exercises that become above-level (downgrade):**
  - Favorites are kept. UF-11.6 shows "Above your level" on them and the notice. The engine already never picks an ineligible favorite (rule 0.2).
  - UF-08.5 visit pins (`addedIds`) don't outlive a visit, so a downgrade can't strand one.
  - Routine items (UF-07) above the new level: the engine already skips an ineligible pinned id (rule 0, "an excluded pinned id is skipped" applies to every eligibility filter). No new UI in this spec; see open question 2.
  - Excluded exercises are unaffected.
- **Upgrade:** the newly eligible exercises become candidates on the next suggest; favorites that were "Above your level" lose the line and become first-ranked again (rule 0.2).
- **Engine re-suggest:** no proactive re-suggest and no engine change. Every `suggest`, `rankSwaps` and `excludedOutAreas` call reads `profile.level` from the cached profile. Save calls `refreshAll` (as today), so the cache on this device has the new level before the user leaves Edit plan.
- **Targets and check-ins:** a level-only save changes no `area_targets` row (`sets_per_14d`, `source` and `updated_at` unchanged, so an "Adapted {d MMM}" source survives), leaves a pending check-in card pending, and leaves `plan_changed_at` unchanged.
- **Zero history:** no difference; the level is a profile field.
- **Returning after 10 days off:** no difference; rule 14 re-entry pre-fills don't read level.
- **Time running out:** not applicable; nothing here is reachable from UF-09.
- **Two devices:** last write wins on `profiles` (NFR-SYNC-3). Device B picks up the new level at its next `refreshAll`.
- **Re-running onboarding:** unchanged. The existing profile still wins (D-0064 §8); Edit plan is the way to change level.

## Acceptance criteria (each one at least one automated test)
Fixtures: F-profile (level beginner, full equipment, rhythm 3–4, no priorities) from `docs/engine-rules.md`, L1 library, timezone Europe/Stockholm, `plan_changed_at` 2026-08-02, default targets from rule 4.

- **AC1 (Level on Edit plan)** Given F-profile, When UF-11.3 opens, Then a radiogroup labelled "Training experience" shows Beginner, Intermediate and Advanced after the Goal group and before the Rhythm group, Beginner is checked, the hint reads "Under 6 months. We start with form-first variations like the goblet squat.", and the line "Level changes which exercises we suggest, not your targets." is shown. When the user picks Intermediate, Then the hint reads "6 months to 2 years. Barbell basics plus targeted accessories.", the target preview is unchanged, and Save is enabled.
- **AC2 (level-only save writes one row)** Given F-profile and a pending AC1 check-in proposal (uf-11 spec), When the user changes Level to Intermediate and taps Save online, Then exactly one write is made, `profiles.update({ level: "intermediate" })` for this user; no `area_targets` upsert and no `plan_checkins` update is made; `refreshAll` runs; the screen goes to `/plan`; and UF-11.2 shows Level "Intermediate" and the check-in card still pending.
- **AC3 (level-only save keeps the streak, server)** Given a profile row with `plan_changed_at` T0, When `level` alone is updated by the owner, Then the update succeeds and `plan_changed_at` is still T0. When `level` is set to "expert", Then the update fails with `23514`.
- **AC4 (mixed save)** Given F-profile, When the user sets Level Advanced and priorities back, hamstrings, arms and taps Save, Then the three D-0070 §3 writes run in order, the `profiles` update includes `level: "advanced"` and the priorities, the targets become back 25, hamstrings 20, arms 15 with `source = default`, and any pending check-in is withdrawn (uf-11 AC15 unchanged).
- **AC5 (dirty and cancel)** Given F-profile, When the user picks Intermediate then Beginner again, Then Save is disabled (the draft equals the baseline). When the user picks Advanced and taps Cancel, Then nothing is written and `profiles.level` is still beginner.
- **AC6 (offline)** Given offline, When the user changes Level, Then Save stays disabled and "Connect to save" is shown; When the connection returns, Then Save becomes enabled without a reload.
- **AC7 (Plan shows Level)** Given F-profile, When UF-11.2 renders, Then "Your plan" lists Goal "Build muscle", Level "Beginner", Rhythm, Priority areas in that order.
- **AC8 (UF-11.6 notice)** Given level beginner, full equipment and favorites [pull-up, back-squat], When UF-11.6 renders with an empty query, Then the Pull up row reads "Above your level", the notice reads "Your level is Beginner. Some favorites are above it." with a link "Change level" to `/plan/edit?from=favorites`. Given favorites [back-squat] only, Then there is no notice. Given equipment [] and favorites [back-squat], Then the row reads "Not available with your equipment" and there is no level notice.
- **AC9 (return to favorites)** Given UF-11.3 opened at `/plan/edit?from=favorites`, When the user saves Level Intermediate, Then the app is on `/plan/favorites` and the Pull up row has no line and the notice is gone. When opened the same way and the user taps Cancel, Then the app is on `/plan/favorites`. Given `/plan/edit?from=https://evil.example`, Then Save and Cancel go to `/plan`.
- **AC10 (UF-08.5 line, no link)** Given level beginner and pull-up (intermediate) in the library, When UF-08.5 shows Pull up, Then its line reads "Above your level. Change it in Plan › Edit plan.", its actions are `aria-disabled` and described by that line, and the sheet contains no link or button that navigates to `/plan*`.
- **AC11 (new level reaches UF-08)** Given the user saved Level Intermediate (AC2) and the device then goes offline, When they open UF-08 and UF-08.5, Then Pull up has Add enabled and no "Above your level" line, and adding it puts it in the plan (rule 0 with level intermediate).
- **AC12 (running workout untouched)** Given a session started at level beginner with a stored `sessions.plan`, When `profiles.level` changes to advanced and the workout resumes, Then `sessions.plan.items` are unchanged and UF-09 shows the same next exercise.
- **AC13 (downgrade keeps favorites)** Given level intermediate and favorite pull-up, When the user saves Level Beginner, Then pull-up is still in `favorite_exercises`, UF-11.6 shows it with "Above your level" and the notice, and `suggest` with that profile never picks pull-up.
- **AC14 (onboarding unchanged, plus one line)** Given a new visitor, When UF-01.3 renders, Then Beginner is preselected, the line "You can change this later in Plan." is shown under the level hint, and the fastest path is still 3 activations (Get started → Continue → Continue) to a rendered UF-01.4 plan.
- **AC15 (nothing in focus mode)** Given any UF-09.1–.9 screen, Then the text "Change level", "Change it in Plan" and any link to `/plan/edit` are not in the DOM.

## Non-goals
- Changing equipment here (it lives on UF-11.4 Account settings, D-0136).
- Level changing reps, rest or targets (rule 4 and D-0061 unchanged; goal and level don't change targets in v1).
- An engine suggestion to change level ("You've done 20 sessions, try Intermediate?"). That would be a check-in-style proposal; out of scope.
- A level picker inside UF-08 or UF-09, or an inline "Allow this one anyway" override on UF-08.5.
- Changing the D-0064 §8 rule that the existing profile wins over a pending onboarding plan.
- Marking routine items that became above-level in UF-07.
- A level line on UF-04 Library.

## Open questions (each with the default that ships)
1. **Should Level live on UF-11.4 Account settings next to equipment instead of UF-11.3?** Default: UF-11.3 (the owner's proposal; level is part of "your plan" and Plan already shows it). The older uf-11 spec line "level and equipment happen in settings" is amended by D-0230.
2. **Should a routine show its above-level items after a downgrade?** Default: no in this spec; the engine already skips them. Revisit if routines are reported as "missing" exercises.
3. **Should UF-08.5 offer a link after all, with a confirm ("Leave setup?")?** Default: no (D-0231). Revisit if the text pointer proves unclear in a user test.
