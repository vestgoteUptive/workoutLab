# User Flows — v2

Source of truth for screens and IDs. Prototype canvas (clickable in Play):
https://claude.ai/artifact/VRmZLyeChxb6WR4zLbkz8w

Reference screens by ID in issues, PRs and commits, e.g. `UF-09.5: add haptic at 10 s`.
New screens take the next step number (UF-09.11). New flows take the next flow number (UF-10).
Supersedes `user-flows-v1.md`; the v1 core model below still applies.

## Core model (from v1)

Hard sets per body area (chest, back, shoulders, arms, core, glutes, quads, hamstrings, calves)
over a rolling 14-day window, compared with per-area targets. Today's plan (UF-08.2) fills the
biggest gaps within the user's time budget.

> Rolling 14 days everywhere, including UF-06.1 (D-0002). The window is the current local day plus the 13 before it (D-0013). Prototype numbers are only illustrative; screens show what the engine returns.

## Design principles

1. **One task on screen during a workout.** Focus mode (UF-09) shows only the current step. Everything else is behind Pause (UF-09.9).
2. **Time is a first-class input.** The time budget (UF-08.1) shapes exercise selection, set counts and the mid-workout time check (UF-09.8).
3. **Pre-fill, don't ask.** Weights and reps are pre-filled from the plan and history; the user only edits when they miss.
4. **Explain the why.** Every suggested exercise carries a one-line reason.
5. **Deterministic engine.** Suggestions and swaps are rule-based and testable.

## Flow index

| Flow | Screens | Purpose | Influences |
|---|---|---|---|
| UF-01 Onboarding | .1 Welcome · .2 Goal · .3 Level & equipment · .4 Schedule & plan · .5 Account | Personal plan in < 60 s | Fitbod, Hevy |
| UF-02 Today | .1 Today · .2 Workout preview | Daily entry point | Strong, Hevy |
| UF-03 List view | .1 Active (set table) · .2 Rest · .3 Summary | Classic logging, reached from Pause | Strong, Hevy |
| UF-04 Exercise library | .1 Browse · .2 Exercise detail · .3 Compare variants | Explain every exercise and variant | JEFIT, wger |
| UF-05 Swap (in workout) | .1 Swap sheet | Replace mid-session | Fitbod |
| UF-06 Progress | .1 Overview · .2 Exercise history | Consistency, volume, strength trend | Hevy, Strong |
| UF-07 Routine builder | .1 Edit routine | Exercises, sets, progression rule | Liftosaur, Hevy |
| UF-08 Session setup | .1 Time & energy · .2 Today's plan (by area) · .3 Swap · .4 Ready (retired, D-0280) · .5 Add exercise · .6 Area detail | Time-boxed, gap-driven workout | Fitbod, Future, NTC |
| UF-09 Focus mode | .1–.10 (below) | One step at a time | Apple Fitness, NTC |
| UF-10 Balance | .1 All areas · .2 Area detail | All areas vs target over 14 days, and why | Fitbod, Hevy, Garmin |
| UF-11 Plan check-in | .1 Check-in · .2 Plan · .3 Edit plan · .4 Account settings · .5 Excluded exercises · .6 Favorite exercises | Adaptive targets; edit goal, rhythm, priorities; exercises never suggested; favorite exercises tried first; export or delete your data | Apple Fitness, Freeletics |

Shared components: C-01 Body map, C-02 Tab bar ("Today · Exercises · Progress · Plan", D-0212; fixed to the bottom of the viewport, padded by the safe-area inset; never shown in UF-08/UF-09, D-0196). C-01 is a body figure (front and back, nine regions, D-0207) above a label grid. In `full` (UF-02.1, UF-10.1) the nine labels are the buttons and tapping a region does the same; `compact` is one link. UF-08 and UF-09 show no figure (the D-0060 §8 ban extends to `BodyFigure`).

## UF-01.5 Account

Comes after UF-01.4 (D-0014). "Save your plan" with a magic link or Google. Returning users reach it from "I have an account" on UF-01.1. The UF-01.4 plan is computed on the device and saved after sign-in. There is no guest mode, and the < 60 s is measured from UF-01.1 to UF-01.4.

## UF-02 Today

- **UF-02.1 Today: workout in progress** (D-0139). When this user has an unfinished workout started on this device in the last 12 h, Today shows one card under the header: "Workout in progress", "Started HH:MM · n of N sets" and **Resume workout**, which reopens focus mode where it was left (UF-09). With several, the newest one. "Start workout" stays. An older unfinished workout shows no card (it is stale, D-0111 §7). Works offline.
- **UF-02.1 Today: week row and week line** (D-0212, `docs/specs/cobalt-mock-behaviour.md` §1.1). Under the `h1`, a Monday-to-Sunday row of seven day letters (done, rest, upcoming; today underlined) and a week line such as "Sunday — 3 of 3–5 done this week". Computed from the cache and queue, so it works offline.
- **UF-02.1 Today: Latest PR** (D-0217, D-0219, spec `docs/specs/cobalt-mock-behaviour.md` §3.2). Directly above Start, "Latest PR Back Squat 100 kg × 8": the newest personal record (engine rule 15: a session's best set that beats every earlier session's sets, heaviest weight then most reps) from the last 14 days. Hidden when there is none. Works offline. It is always the actual set, never the estimated 1RM (D-0219 as amended by D-0257: the estimate shows on UF-06.2 only).
- **UF-02.1 Today: Quick 20-min** (D-0217, spec §3.3). Under Start, "Not feeling it? Quick 20-min", a text link that opens UF-08.1 with 20 minutes chosen. The user still sees the time and taps "Suggest my workout". Shown wherever Start is.

## UF-04 Exercise library

- **UF-04.1 Exercises** (D-0217, spec `docs/specs/cobalt-mock-behaviour.md` §3.4): search, and one chip row: All, "Upper", "Legs", the nine areas, and the "My equipment" toggle. A polite "6 results" count above the list. Each row shows at most one tag: "Not suggested", "Favorite", "In plan" (in one of your routines), "Variant" (a variant of one) or "Beginner". Works offline.
- **UF-04.2 Exercise detail** (D-0207): shows a front-and-back body figure with the exercise's primary areas (weight 1.0) solid and secondary areas (weight 0.5) hatched, with visible Primary and Secondary labels and swatches. The figure is not tappable.
- **UF-04.2 Exercise detail: Weight step** (D-0251, D-0259, spec `docs/specs/rir-progression-and-increments.md`): a "Weight step" row below the Favorite and "Don't suggest this" actions, shown only for an exercise with an external load that is not timed (hidden, not disabled, for timed and bodyweight exercises). It sets how much the weight goes up each time. A radio group "Weight step" with 1.25 kg, 2.5 kg, 5 kg and Other (a field "Step in kg"); allowed values are 0.25 to 10 kg in multiples of 0.25, otherwise "Enter a step from 0.25 to 10 kg, in multiples of 0.25." and nothing is saved. The default is the library value, shown as "Weight step: 2.5 kg (default)" or "1.25 kg (yours)"; "Use default ({n} kg)" shows only while an override exists. A change applies from the next pre-fill and never rewrites a logged set or a running workout's shown weight. kg only (D-0017). **Offline:** the row stays editable (a stated carve-out from the offline-disabled UF-04.2 controls: the write is stored on the device and queued, last write wins). Never shown on UF-09, UF-01 or UF-08.

## UF-06 Progress

- **UF-06.1 Overview**: consistency, volume and the Balance card. The estimated 1RM never appears here (D-0257).
- **UF-06.2 Exercise history** (D-0254 to D-0258, spec `docs/specs/estimated-1rm.md`): for one exercise, the stat cards Best set, Heaviest, Sessions and, for a loaded exercise, **Est. 1RM** ("about 124 kg"), then a delta line, a line chart of the best estimate per session, a "Show as table" toggle, an explanation line and the existing session rows. Amends D-0068 (no e1RM or chart in UF-06) and D-0219 (rule 15, "never the e1RM number") for this screen alone (D-0257). The number comes from the deterministic engine (rule 16, pure function, display-only); it never changes a target, suggestion or pre-fill. Estimate: Epley on the best hard set of 1–10 reps per session, shown to the nearest kg and always as "about". Window: the 56 cached local days ("Last 8 weeks"), x axis proportional to days.
  - **Delta line** (two or more points): "Up 3 kg since 12 Oct", "Down 2 kg since 12 Oct" or "Same as 12 Oct", against the first point in the window. Words carry the direction, not colour or an arrow alone.
  - **Chart:** `role="img"` with an `aria-label` summary (count, first and last values and dates); the latest point carries a text label. **Show as table** / **Hide table** is a button (`aria-expanded`, at least 44 px) that reveals a real table, "Estimated 1RM per session": Date, Best set, Est. 1RM, oldest first. Focus stays on the toggle.
  - **States:**
    1. Zero history: the existing "no sets" line; no card, no chart.
    2. Sets but none valid (all above 10 reps, or weight 0): no Est. 1RM card; the line "No estimate yet. Estimates need a weighted set of 1–10 reps."
    3. Bodyweight or timed exercise: the line "Estimated 1RM is for weighted lifts."; no card.
    4. One point: the card, one dot with its label and no line, "One session so far. Log it again to see a trend."; no delta.
    5. Two or more points: card, delta line, chart and table toggle.
  - Offline: identical, from the cache and queue. Never reachable from UF-08 or UF-09. Not shown on UF-02.1 (Latest PR stays the actual set), UF-03.3 or UF-06.1; those placements stay deferred (D-0257).

## UF-08 Session setup

**Entry:** Start on UF-02.1 or UF-02.2. The estimated 1RM never appears anywhere in UF-08 (principle 1; it lives on UF-06.2 only, D-0257).

- **UF-08.1 Time & energy**
  - Minutes stepper (±5, 15–120) and quick chips 20/30/45/60/90. Shows "done by HH:MM". The minutes are asked first, before every workout (principle 2); nothing below changes that.
  - Toggle: warm-up counts in the time budget (default on).
  - Energy: Low / Normal / High. Low trims accessory sets, keeps main-lift weights. High may add a back-off set.
  - Skip today (D-0191, GitHub #33): optional toggle chips for the nine areas, none pressed by default, for this workout only. Skipped areas reach the engine as `avoidAreas` (rule 6.1) and stay out of the plan.
  - Live fit line: "Lower A fits: N exercises, M sets".
  - "Suggest my workout" opens UF-08.2 with the default plan (the engine's plan grouped by area, D-0274 §2).
  - "Start empty" (D-0236, D-0274 §6, spec `docs/specs/areas-first-planning.md`): a secondary button under "Suggest my workout". Same minutes, warm-up, Energy and Skip today. Opens UF-08.2 with no areas, for this visit only (not remembered).
- **UF-08.2 Today's plan** (D-0274, D-0280, spec `docs/specs/areas-first-planning.md`): the plan by body area. Exercise names are not on the area row; exercises are a detail behind each row (UF-08.6).
  - Title "Today: Chest · Back · Core" (the plan's areas in the engine's priority order); with no areas "Today: pick your areas". Under it one line, "Done by HH:MM" (now plus the plan's minutes, re-derived after every edit); with no areas "{n} min to fill".
  - Time bar, one segment per area, and its line "About {m} of {n} min"; over budget is said in words, with no colour change. "Why" chips for the whole session (days since last trained, area below target). "Skipping today: …" line when areas were skipped on UF-08.1.
  - One row per area: the area name, its time cost ("~14 min"), a sets stepper **− 6 sets +**, the muted line "Last 14 days: 8 of 20 sets" (`load / target`) and "{n} exercises" with a chevron that opens UF-08.6.
  - **+** adds a set (maximum 4 sets for a main lift, 3 for another exercise, 2 exercises per area) and is refused in words when it doesn't fit the minutes left: "No time for another set. Pick more time or remove a set elsewhere." **−** removes a set; at the 2-set minimum it becomes **Remove**, which takes the area out for this visit (it joins the skipped areas and moves to "Add an area"). One polite status line announces each change.
  - **Add an area:** the areas not in the plan, lowest projected coverage first, each with "Last 14 days: 0 of 20 sets" and **Add**. An area that can't be added says why: "Recovering", "Skipping today", "No exercise available", "No time left". A collapsed disclosure, open when the plan has no areas.
  - **Fill the rest for me:** adds the engine's next available areas until nothing more fits; shown only while one still fits.
  - Time chips 20 / 30 / 45 / 60 / 90. A chip rebuilds the plan for the new minutes, keeps this visit's removed areas, swaps, adds and exclusions, and clears the +/− set edits and added areas: "Plan rebuilt for {n} min. Your set changes were cleared." A main lift chosen on this visit stays across a rebuild; one that no longer fits is named in "Doesn't fit in {n} min: …" and more time brings it back.
  - The order the workout runs in is automatic (engine rule 7.6, D-0275): main lift first, then other compounds, then isolation work, areas alternating, machines grouped. It is not listed before Start.
  - **Focus mode** (D-0280 §3): a collapsed disclosure above Start, collapsed on every visit. Inside: "How focus mode works" in four steps and the three switches (Sound cues, Voice countdown 3-2-1, Keep screen awake). Opening it is not an edit.
  - **Start workout** (the primary button; it was UF-08.4's Start): writes the session and opens UF-09.1. From UF-08.2 shown it takes **1 tap with no edit and 3 with two edits** (an edit is one tap on − / + / Remove / Add {Area}); from UF-02.1 it is 3 taps with no edit. At no areas it is disabled (`aria-disabled`) with "Add at least one area.", whatever the entry. A rejected write says "Couldn't start the workout. Try again."
  - States, one line each:
    - Zero history: the engine's default plan, rows read "Last 14 days: 0 of 20 sets", no attention styling.
    - 10 days off: same rows; the why chips name the areas furthest below target and nothing about the break is added here.
    - Time running out (15 or 20 min): one or two areas, **+** refused with the time reason, "Add an area" rows read "No time left"; "Nothing fits in {n} min" only when nothing fits at all.
    - Offline: identical, from the device; the offline icon shows and nothing is written before Start. The stored-list buttons in UF-08.6 are disabled.
    - Start empty: no rows, title "Today: pick your areas", "Add an area" open, "Fill the rest for me" shown, Start workout disabled.
  - Excluded exercises (D-0199) and favorites (D-0202) apply as before and show in UF-08.6. A neutral notice, "Not suggested: {areas}. Every exercise for them is excluded.", when exclusions leave an area with no exercise.
  - Retired from UF-08.2 (D-0274 §3, §4, §6, §7): Reorder and Move up / Move down (the order is automatic; "Do {name} later" in UF-09.9 stays), Shuffle on this screen (rule 13 stays in the engine), and the exercise-level Suggestions section, "Other suggestions" and the empty mode with its own budget words (Start empty opens the area plan instead).
- **UF-08.6 Area detail** (D-0276, D-0274): behind an area row, a full screen of the setup (no tab bar) with a Back link to UF-08.2. Title is the area; it shows the area's sets, time and `load / target` line, then its exercises in run order, each with the name, "Favorite" and "Main lift" tags, sets × reps · weight · minutes, a one-line reason (or "Added by you") and the actions Swap (opens UF-08.3), **Not today** (replace it with the best alternative for "equipment taken", this visit only: "{old} · Not today · Undo"), Remove (no refill; the Removed line and "Never suggest" work here) and, on a non-main compound, "Start with this". "Add exercise" opens UF-08.5. Removing the last exercise takes the area out and returns to UF-08.2: "{Area} removed. Add it back below." Works offline.
- **UF-08.5 Add exercise** (D-0205, D-0274 §5): a sheet over UF-08.6, the UF-08.3 pattern. A search field over the library (kind `exercise`). Empty query: Favorites (D-0202) first, then the open area's other exercises, then "Today's areas". Each result has Add and, for a compound, "Start with this". A result that can't be added says why: "In this workout", "Excluded …", "Not available with your equipment", "Above your level. Change it in Plan › Edit plan." (text only, no link out of setup, D-0231), "Skipping {Area} today", "{Area} is recovering". **Add is local:** it adds that exercise at 3 sets, else 2, if it fits the minutes left, and changes nothing else in the plan; an exercise whose area isn't in the plan adds that area. It stays through a time rebuild. An add that doesn't fit is refused with "{name} doesn't fit in {n} min." Works offline.
- **UF-08.3 Swap before starting** (opened from UF-08.6)
  - Asks why: equipment taken / discomfort / variety / short on time. Reason changes ranking.
  - Each alternative shows muscle match, time cost and equipment; top result marked "Best match".
  - Option "Always use this in <routine>".
  - Checkbox "Don't suggest {current} again", unchecked, applied on confirm (D-0199). UF-05.1 has the same checkbox. Excluded exercises are never in the list.
- **UF-08.4 Ready (retired, D-0280).** There is no such screen: Start, the "Done by" line and the Focus mode disclosure are on UF-08.2. The ID stays in the index and is never reused.

## UF-09 Focus mode

Every screen: pause button, thin progress bar (warm-up + one segment per exercise), exercise index. No other chrome. The estimated 1RM never appears anywhere in UF-09, not even on UF-09.9 Paused: no number, no chart, no link (principle 1; it lives on UF-06.2 only, D-0257).

| ID | Screen | Shows | Primary action | Timer |
|---|---|---|---|---|
| UF-09.1 | Get ready | 5-s countdown, first item | Start now / Skip warm-up | 5 s auto |
| UF-09.2 | Warm-up | "Warm-up · move n of N" (D-0212), move name, figure, one cue | Pause · restart · next move | 40 s per move, auto-advance |
| UF-09.3 | Current set | "Lifting · set n of N" (D-0212), exercise, weight × reps, plate loading for barbell lifts ("Each side 25 + 15 kg" or "Bar only", from the bar and plates on UF-11.4; none when no exact loading, D-0217), one cue | **Done** (full-width session button, D-0208, D-0212) | none |
| UF-09.4 | Confirm set | Pre-filled reps and weight, reps in reserve | Save · start rest when a rest follows (D-0212) | auto-save after 5 s unless touched |
| UF-09.5 | Rest | Countdown on the rest-to-lift drain; the next set (its exercise name and load) or, after an exercise's last set, the next exercise's name and cue; nothing further ahead (D-0208, D-0273) | −15 s · +15 s · Skip | auto-start; cue at 10 s; "GO" at 0 |
| UF-09.6 | Next exercise | "Next exercise" caption, done line, name, illustration, sets/reps/weight, cue, "Set-up time" label (D-0212) | I'm ready · Swap | set-up countdown 60 s |
| UF-09.7 | Timed set | "Timed set · n of N" caption, hold name, deep fill (D-0208, D-0212) | Pause/resume | 3-s get-in-position, then hold time; auto-logs |
| UF-09.8 | Time check | Minutes behind, projected finish, 3 options | Continue | only between exercises, only when behind |
| UF-09.9 | Paused | "Workout paused · timers stopped" caption (D-0212), elapsed, left, sets done, one status line | Resume · swap · do later · add exercise · skip · how-to · list view · end | all timers stopped |
| UF-09.10 | Add exercise (D-0243, D-0246, spec `docs/specs/add-exercise-in-session.md`) | Sheet over UF-09.9: "{m} min left", search, Favorites, Today's areas, row reasons | Add (goes after the current exercise; refused when it doesn't fit the time left) | workout stays paused |

**Do {name} later** (UF-09.9, D-0205): for a busy machine. Moves the current exercise, if none of its sets is logged, to just after the next unfinished one, then resumes at UF-09.6 for that one (or the warm-up/UF-09.1 where it was). Hidden for a partly done exercise, for the last unfinished one and on a pause from UF-09.8. The time check's remaining time is unchanged. Works offline and survives a reload (the order is written to the session's plan).

**Add exercise** (UF-09.9 → UF-09.10, D-0243, D-0246, spec `docs/specs/add-exercise-in-session.md`): from UF-09.9 Paused only, never from UF-09.1–.8, and hidden on a pause from UF-09.8. It opens the UF-09.10 sheet: the UF-08.5 search, Favorites and "Today's areas" lists, with no "Start with this" and no Suggested section. The new exercise goes right after the current one (appended when the current one is last), for this workout only. It is refused when even 2 sets don't fit the time left ("{name} doesn't fit in the {m} min left.") or when the plan has 8 exercises, done and skipped included ("This workout has 8 exercises, the most it can hold."). An exercise already in the plan, or with a set logged in this workout, reads "In this workout" ("Skipped in this workout" for a skipped one). After an add the sheet closes and the workout stays paused on UF-09.9, with focus on "Add exercise" and the status line "{name} added after {current name}." Back and Escape close only the sheet. Works offline and survives a reload (the plan is written to the session first, then queued).

**Reps in reserve now count** (UF-09.4, D-0250, D-0252, D-0259; amends D-0026): the RIR you log gates the next weight increase, and nothing else changes in focus mode (no new control, no new step, the 5-s auto-save is as before). When every set at the top weight reached the top reps, RIR 0 or 1 on any of them holds the weight once, with the reason "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up." (`hold_effort`); RIR 2 or more, or no RIR logged, raises it as before; after one hold at the same weight and top reps the next session raises it whatever the RIR. A break of 10 or more days overrides RIR. Rep, record, balance and time rules ignore RIR. The weight stepper on UF-09.4 steps by the exercise's weight step (UF-04.2).

**Loop per set:** 09.3 → 09.4 → 09.5 → 09.3. **Between exercises:** 09.8 (if behind) → 09.6 → 09.3. **Finish:** UF-03.3 summary.

## UF-10 Balance

Full spec and ACs: `docs/specs/uf-10-balance.md` (D-0013). **Entry:** the body map on UF-02.1, the Balance card on UF-06.1, "See balance" on UF-03.3. Never reachable from UF-08 or UF-09.

- **UF-10.1 All areas**
  - Header "Last 14 days · date range", C-01 body map (a body figure above a label grid; the nine labels are the buttons and tapping a region does the same, D-0207), and nine rows: `load / target`, a coverage bar (`coverage-0..4`), a `warn` outline when the area needs attention, and a "Recovering" tag.
  - Order: attention first, then deficit descending, then the fixed area order.
  - Zero history: every area `0 / target`, with "Start workout". Offline: "Offline · last synced HH:MM", recomputed on the device including queued sets.
- **UF-10.2 Area detail**
  - `load / target`, deficit %, target source, "Last trained N days ago", a 14-day strip (sets per day) and the contributing exercises.
  - When the engine flags rule 6: a "Recovering" tag explained as "≥ 6 weighted hard sets in the last 48 h".

## UF-11 Plan check-in

Full spec and ACs: `docs/specs/uf-11-plan-checkin.md` (D-0018). Principle: targets adapt, and never silently.

- **UF-11.1 Check-in**: a card on UF-02.1 and UF-11.2 when two 14-day periods in a row were under (< 70 % of the planned minimum) or over (> 110 % of the planned maximum). It proposes rhythm −1 or +1 per week on both bounds, clamped to 1–7, and shows the clamped values (1–2 → "Switch to 1–1 per week?", never "0–1"; 6–7 → "Step up to 7–7 per week?"). No card when the clamped rhythm equals the current one (1–1 under, 7–7 over). It previews the new targets. Accept / Keep current. Never shown on UF-03, UF-08 or UF-09. Offline: the actions are disabled.
- **UF-11.2 Plan** (D-0203): answers "What am I aiming for?" with a purpose line under the title (the goal, rhythm and per-area 14-day targets, and how they adapt). Cards: "Your plan" (goal, level, rhythm, priority areas, Edit plan; level D-0230), with a "Favorite exercises · n" row (→ UF-11.6) directly above an "Excluded exercises · n" row (→ UF-11.5) (D-0202, D-0199); "Targets" (per-area tile grid; a source shows only when it isn't the default: "Adapted {d MMM}" / "Set by you"; a "See this period in Balance" link to UF-10.1); "Check-ins" (the next check-in date and the last 3 check-ins); "Routines". Edit plan is the one primary action, except while a check-in is pending (then Accept is).
- **UF-11.3 Edit plan**: goal, level (Beginner / Intermediate / Advanced, D-0230, spec `docs/specs/editable-level.md`), rhythm (1–7 per week), up to 3 priority areas. Save re-derives the targets and resets the check-in streak, except a save that changes only the level: that writes `profiles.level` alone and keeps targets, a pending check-in and the streak. Opened as `/plan/edit?from=favorites`, Save and Cancel return to UF-11.6.
- **UF-11.4 Account settings** (D-0136, D-0195): reached from an "Account and sign out" link in UF-11.2's header, never from UF-03, UF-08 or UF-09. It has a back link to Plan (D-0203). It shows the signed-in email with "Sign out" right under it, the equipment section (C-03 checkboxes), the "Bar and plates" section (bar weight 0–50 kg, default 20; the plate sizes you have, default 25/20/15/10/5/2.5/1.25 kg; used by UF-09.3, D-0217, D-0218), "Export my data" (one JSON file with every row the user owns, NFR-PRIV-4), and "Delete account" (NFR-PRIV-5). Sign out ends this device's session only, clears this user's cached data and the app's stored keys on the device, and keeps unsynced workouts (with a confirm when there are any) so they upload at the next sign-in. Deletion is confirmed by typing "delete". It removes the account and every owned row on the server (D-0135), then this user's data on the device, then signs out. Offline: export and delete are disabled.
- **UF-11.5 Excluded exercises** (D-0199, spec `docs/specs/excluded-exercises.md`): reached from the UF-11.2 row, never from UF-03, UF-08 or UF-09. The user's "never suggest" list: never picked by the engine or offered as a swap, still shown in the library and history, and past sets still count. A search field over the library (kind `exercise`). Empty query: the excluded exercises by name, each with primary areas, "Excluded {d MMM}" and Include again. With a query: the matches, each with Exclude or Include again. A standing neutral notice (the same one as UF-08.2, not `warn`) when exclusions leave an area with no exercise: "Not suggested: {areas}. Every exercise for them is excluded." Exercises are also excluded from UF-04.2 ("Don't suggest this"), UF-08.2 (after Remove) and the UF-08.3 / UF-05.1 swap checkbox. Offline: the list still applies, and every control that changes it is disabled with "Connect to change excluded exercises".
- **UF-11.6 Favorite exercises** (D-0202, GitHub #46, spec `docs/specs/favorite-exercises.md`): at `/plan/favorites`, reached from the UF-11.2 row, never from UF-03, UF-08 or UF-09. The user's favorites: when a workout trains an area, a favorite with weight 1.0 there is tried first; the gaps still choose the areas, and recovery, Skip today, equipment, level and the time fit still apply. Empty query: the favorites grouped by area in the fixed order (an exercise appears under each of its weight-1.0 areas; areas without a favorite are omitted), each with Remove and, when the engine can't use it, "Not available with your equipment" or "Above your level"; when any row is above level, one notice under the header, "Your level is {Level}. Some favorites are above it.", with a "Change level" link to UF-11.3 (D-0231). A search field over the library (kind `exercise`), each result with Add or Remove. Favorites and excluded exercises are mutually exclusive: adding one removes the other, with a one-line status. Exercises are also favorited from UF-04.2 (a "Favorite" toggle beside "Don't suggest this"); UF-04.1 and UF-08.2 show a "Favorite" text tag. Nothing on UF-05.1, UF-08.3, UF-09 or in onboarding. Offline: the list still applies, and every control that changes it is disabled with "Connect to change favorites".

## Open questions

Answered by default (revisit in Phase 5):
- Guest mode: no; the account step comes after the plan preview (D-0014). Importing history (Apple Health, Strava): out of scope v1 (owner product-owner, `docs/gaps.md` §D, Phase 5 `wl-idea`).
- Hard-stop clock time on UF-08.1: both; a finish time converts to minutes at start (owner product-owner, T-0303).
- Watch companion, lock-screen live activity, voice cues: out of scope v1 except the 3-2-1 cue (Voice countdown switch on UF-08.2) (owner product-owner, Phase 5 `wl-idea`).
- Carry weights between variants on a swap (UF-05, UF-08.3): yes when the variant shares a primary area and equipment type (owner product-owner, T-0306).
- Prototype inconsistencies (the plank on UF-09.7, set counts): the engine output is the truth (D-0002).
