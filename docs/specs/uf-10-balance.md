# UF-10 Balance — spec

- **Flow:** UF-10 Balance (new in v2, D-0002; was v1 UF-08)
- **Screens:** UF-10.1 All areas · UF-10.2 Area detail
- **Built in:** T-0307 (web-feature:UF-06). Engine data comes from T-0200 (`balance()`).
- **Decisions:** D-0002, D-0003 (coverage colour), D-0011 (NFR), D-0013 (window, steps, order)

## Purpose
Show how each of the nine body areas is doing against its target over the rolling 14 days, and why. Balance is the rolling-window view behind the C-01 body map on Today.

## Entry and exit
- UF-02.1 Today: tapping the body map opens UF-10.1. Tapping one area on the map opens UF-10.2 for that area.
- UF-06.1 Progress: the "Balance" card opens UF-10.1.
- UF-03.3 Summary: "See balance" opens UF-10.1.
- UF-10 is **not** reachable from UF-08.* or UF-09.* (principle 1; UF-09.9 Paused has no Balance link).
- The empty state and UF-10.2 offer "Start workout", which opens UF-08.1. It adds no extra input to the engine.

## UF-10.1 All areas
- Header: "Last 14 days · {D−13}–{D}" (e.g. "14–27 Sep"). A "Plan" link goes to UF-11.2.
- C-01 body map with the coverage colours (D-0003, D-0013).
- Nine rows, ordered by D-0013. Each row shows: area name, `load / target`, a bar filled to `min(r, 1)` in the row's coverage colour, a `warn` outline when `needsAttention` is true, and a "Recovering" tag when the engine flags rule 6.
- Tapping a row opens UF-10.2.

## UF-10.2 Area detail
- Area name, `load / target`, deficit as a whole percent (`round(deficit × 100)`, half up).
- Target source: "From your plan" (`default`) or "Adapted {d MMM}" (`adapted`, with the date of `updated_at`).
- "Last trained N days ago": today, yesterday, or N days. Before any session: "Not trained yet".
- 14-day strip: one cell per local day, D−13…D, showing the weighted hard sets that day (blank when 0).
- Contributing exercises in the window: name, weighted sets contributed, date last done. Sorted by contribution descending, then by name.
- The "Recovering" tag, with the rule-6 explanation: "≥ 6 hard sets in the last 48 h".

## Data the screens need from the engine
Per area: `area, load, target, deficit, coverageStep (0–4), needsAttention, recovering, lastTrainedDate | null, days[14], contributors[{exerciseId, weightedSets, lastDate}]`, plus `windowStart`, `windowEnd` and `computedAt`. The UI shows these values and computes none of them (principle 3). The shape is proposed to T-0101/T-0102.

## Edge cases
- **Zero history:** every area shows `0 / target` with `coverage-0`, the copy "Nothing logged in the last 14 days. Your first workout fills this in.", and "Start workout".
- **Offline:** balance is recomputed on the device from cached history plus queued sets. The header shows "Offline · last synced HH:MM". There is no error screen.
- **Returning after 10 days off:** old sets stay in the window until they are 14 local days old. "Last trained 10 days ago" is shown, and attention follows the engine.
- **Time running out:** not applicable. UF-10 is never shown during a workout.
- **Over target:** `load` can exceed `target` (e.g. "24 / 20"). The bar caps at full and the step is `coverage-4`.

## Acceptance criteria (for T-0307; each one is at least one automated test)
Fixtures: timezone Europe/Stockholm, today D = 2026-09-27, default targets (rule 4): chest/back/glutes/quads 20, shoulders/hamstrings 16, arms/core/calves 12, no priority areas. Weights: back squat = quads 1.0, glutes 1.0, hamstrings 0.5, core 0.5; Romanian deadlift = hamstrings 1.0, glutes 0.5.

- **AC1 (zero history)** Given a user with no sessions, When UF-10.1 opens, Then it shows 9 rows reading `0 / 20` (chest, back, glutes, quads), `0 / 16` (shoulders, hamstrings) and `0 / 12` (arms, core, calves), every bar uses `coverage-0`, and the empty-state copy and "Start workout" (→ UF-08.1) are visible.
- **AC2 (weighted load, warm-ups excluded)** Given 6 hard sets and 2 warm-up sets of back squat on 2026-09-25, When UF-10.1 opens, Then quads shows `6 / 20`, glutes `6 / 20`, hamstrings `3 / 16` and core `3 / 12`.
- **AC3 (fractional display)** Given 5 hard sets of back squat on 2026-09-25, When UF-10.1 opens, Then hamstrings shows `2.5 / 16` and quads shows `5 / 20` (no ".0").
- **AC4 (coverage steps)** Given quads target 20, When the engine returns quads loads of 0, 6, 7, 14, 20 and 24, Then the quads row uses `coverage-0`, `-1`, `-2`, `-3`, `-4` and `-4` respectively, and load 24 reads `24 / 20` with the bar full.
- **AC5 (order)** Given an engine result where calves (deficit 0.9) and hamstrings (deficit 0.8) have `needsAttention = true`, chest and back both have deficit 0.5, and all other areas have deficit 0.2, When UF-10.1 renders, Then the order is calves, hamstrings, chest, back, shoulders, arms, core, glutes, quads, and only calves and hamstrings have the `warn` outline.
- **AC6 (window boundary)** Given hard sets completed at 2026-09-14 23:59 and 2026-09-13 23:59 local time, When balance is computed at 2026-09-27 12:00, Then the 09-14 set counts and the 09-13 set does not. When the clock passes 2026-09-28 00:00, Then the 09-14 set no longer counts either.
- **AC7 (returning after 10 days off)** Given the only session was on 2026-09-17 with 4 hard sets of Romanian deadlift, When UF-10.2 for hamstrings opens on 2026-09-27, Then it shows `4 / 16`, deficit `75 %`, "Last trained 10 days ago", and the strip cell for 17 Sep shows 4. When it opens on 2026-10-01, Then it shows `0 / 16` and the strip is empty.
- **AC8 (offline, queued sets count)** Given the last server sync was at 08:10 and the device is offline with 3 queued hard sets of Romanian deadlift completed at 09:00, When UF-10.1 opens, Then hamstrings includes +3 and glutes +1.5 compared with the 08:10 values, the header reads "Offline · last synced 08:10", and no error state is shown.
- **AC9 (area detail contributors)** Given 4 hard sets of Romanian deadlift on 2026-09-20 and 4 hard sets of back squat on 2026-09-25, When UF-10.2 for hamstrings opens, Then it shows `6 / 16`, deficit `63 %`, "Last trained 2 days ago", contributors "Romanian deadlift 4 · 20 Sep" then "Back squat 2 · 25 Sep", and strip cells 20 Sep = 4 and 25 Sep = 2.
- **AC10 (target source)** Given the hamstrings target has `source = adapted` and `updated_at = 2026-09-20`, When UF-10.2 opens, Then it shows "Adapted 20 Sep". Given `source = default`, Then it shows "From your plan".
- **AC11 (recovering)** Given the engine flags quads `recovering = true`, When UF-10.1 renders, Then the quads row shows "Recovering". Given `recovering = false`, Then no tag is shown.
- **AC12 (not reachable in a workout)** Given an active session on UF-09.9 Paused, When its actions are listed, Then none of them navigates to UF-10.*.
- **AC13 (UI computes nothing)** Given a stubbed engine that returns quads `load 3, target 20, coverageStep 4` (deliberately inconsistent), When UF-10.1 renders, Then it shows `3 / 20` with `coverage-4`. This proves the UI renders the engine output and never recomputes it.
- **AC14 (accessibility)** Given hamstrings at 6 of 16 with `needsAttention = true`, When the row is read by a screen reader, Then its accessible name is "Hamstrings, 6 of 16 hard sets, needs attention", and the row's hit area is at least 44×44 CSS px (NFR-A11Y-2).
