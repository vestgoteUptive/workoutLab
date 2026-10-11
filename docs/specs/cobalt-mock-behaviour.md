# Cobalt mock: new behaviour and copy (D-0212)

- **Source:** the canvas `Design-docs/docs/design/redesign-cobalt/canvas/Design Directions.dc.html`, rounds 3–5, on branch `origin/design/redesign-cobalt`. Read it with `git show`; it is never copied into `main`.
- **Read against:** the app on `main` at 4b59a1d (2026-10-09): `apps/web/src/lib/i18n/en.ts` and `flows/*.ts`, and the feature views.
- **Owner answer (2026-10-09):** "include the new behaviour and copy shown in the mock", specced as real work and kept separate from the pure restyles.
- **Written by:** product-owner (groom). §3 added 2026-10-09 (spec mode) after the owner promoted four §2 items (H-34, D-0217).

The README still says "behaviour, copy and flows are unchanged" (D-0208 §6). D-0212 amends that for the items in §1, and D-0217 for the items in §3. Everything else in §2 keeps the app's behaviour and copy. A restyle ticket never changes a string; only the §1 and §3 tickets do.

Most of the canvas copy is sample data ("Anna", "Lower A", "100 kg"), not wording. This inventory lists only differences in **what a screen shows or says**, frame by frame.

## 1. Included (built in this phase)

### 1.1 UF-02.1 week row and week line (T-0623)
**Canvas:** "Today" (#turn-3), "Today · check-in pending" (#turn-5). README "Week row (Today)".

**Placement.** The week row sits in Today's header, directly under the `h1` "Today". The date line becomes the week line.

**Week.** The local Monday-to-Sunday week that contains `now`, in the user's time zone (the `timeZone` Today already uses).

**A day's status:**

| Status | When | Visible letter | Accessible text |
|---|---|---|---|
| done | the day has at least one set that isn't a warm-up and isn't tombstoned (`deletedAt` null), with its `completedAt` in that local day. The source is Today's engine history: the cache plus the queue, so pending offline sets count (D-0034 §3). | `--wl-ink`, weight 600 | "Monday, done" |
| rest | a past day of this week with no such set | `--wl-ink-muted`, weight 400 | "Tuesday, rest" |
| upcoming | a later day of this week | `--wl-ink-muted`, weight 400 | "Thursday" |

- **Today** is done when it has such a set, and otherwise has no status. It is never "rest", because the day isn't over. It gets a 2 px underline at a 6 px offset and `aria-current="date"`, and its accessible text is "Sunday, today" or "Sunday, today, done".
- **Markup:** an `<ol>` named "This week", with seven `<li>` items, Monday first. The letters come from `en.uf02.weekLetters` = `["M", "T", "W", "T", "F", "S", "S"]`, and the accessible day names from `Intl.DateTimeFormat(locale, { weekday: "long" })`.
- **Look:** letters at 1.375rem/600 with a 14 px gap. Each letter is a plain `<span>` and isn't interactive.

**Week line** (replaces `formatTodayDate`):
- `weekLine(weekday, count, range)` gives "Sunday — 3 of 3–5 done this week".
  - `count` = the number of distinct `sessionId`s among this week's done-day sets.
  - `range` = `"{rhythm_min}–{rhythm_max}"`, or `"{n}"` when they're equal.
- `weekLineNoPlan(weekday, count)` gives "Sunday — 3 done this week". It's used when no cached profile exists (the no-plan state).

**Edge cases:**
- **Zero history:** every past day is rest, and the count is 0 ("Monday — 0 of 3–5 done this week").
- **Returning after 10 days off:** only this week shows. Days before the return are rest, and the attention and empty lines are unchanged.
- **Offline:** computed from the cache and queue with no network wait. It never shows a spinner, because the row renders with the first cache read.
- **A set deleted later** (tombstone) no longer counts, after the next cache read.
- **A workout that crosses midnight** counts on both days, because each set counts on its own day. The count is still one session.
- **Week boundaries:** Monday 00:00 local. `now` is fixed per mount, as it already is for the date line, so a screen left open past midnight updates on the next mount.

### 1.2 UF-09 state captions, including "Lifting" (T-0619)
The README requires every session screen to name its state in text, because lift and rest differ by hue only (1.03:1). Today only UF-09.1 ("Get ready"), UF-09.5 ("Rest") and UF-09.9 ("Paused") do.

A caption `<p class="wl-uf09__state">` is the first line of the view, above the `h1`. The `h1`s are unchanged.

| Screen | Caption | Key in `flows/uf-09.ts` |
|---|---|---|
| UF-09.2 Warm-up | "Warm-up · move 1 of 3" (replaces "Move 1 of 3") | `warmupCaption(n, total)` |
| UF-09.3 Current set | "Lifting · set 2 of 4" (replaces the "Set 2 of 4" line) | `liftingCaption(n, total)` |
| UF-09.3, a back-off set | "Lifting · back-off set" (replaces "Back-off set") | `liftingBackoff` |
| UF-09.4 Confirm set | the same caption as UF-09.3 for that set | `liftingCaption` / `liftingBackoff` |
| UF-09.6 Next exercise | "Next exercise" | `titles.next` (existing) |
| UF-09.7 Timed set | "Timed set · 1 of 3" (set n of the item's sets) | `timedCaption(n, total)` |

- The "Get in position" and "Hold" phase line on UF-09.7 stays.
- `setOf`, `backoffSet` and `warmupMove` are removed once nothing reads them.

### 1.3 UF-09 wording (T-0620)

| Where | Today | New |
|---|---|---|
| UF-09.3 primary | "Done set" | "Done" (`doneSet`); the ✓ is an `aria-hidden` icon |
| UF-09.3 save error | "Couldn't save. Tap Done set again." | "Couldn't save. Tap Done again." |
| UF-09.4 primary, when another set of the same item follows (so the machine goes to UF-09.5 Rest) | "Save" | "Save · start rest" (`saveStartRest`) |
| UF-09.4 primary, after the item's last set (the next step is UF-09.8, UF-09.6 or the summary) | "Save" | "Save" (unchanged) |
| UF-09.9 caption above `h1` "Paused" | — | "Workout paused · timers stopped" (`pausedCaption`) |
| UF-09.9 stats | "Elapsed 23:10" · "Left 22 min" · "Sets 6 / 16" | "23:10 elapsed" · "22 min left" ("1 min left") · "6 / 16 sets", each drawn value-first (the value in the stat role, the word in the label role) |

**Kept:**
- UF-09.5 "Skip rest". The canvas shows "Skip" on Rest but "Skip rest" on List view rest; the longer name is clearer out of context.
- "Next move", "Restart", "−15 s" and "+15 s".
- The autosave line, which already matches the canvas.

### 1.4 UF-09 status lines (T-0621)
- **UF-09.4 "Target hit."** (`targetHit`):
  - It shows when the item has a non-null `repsMax`, the set isn't timed and isn't a back-off set, and the reps value in the input is ≥ `repsMax`.
  - It updates as the stepper or input changes.
  - It's plain text, not a live region, because the autosave line is already polite.
  - It never shows for timed items, for a null `repsMax`, or below the top of the range.
- **UF-09.6 done line** `exerciseDone(name, sets)`: "Back Squat done · 4 sets" ("1 set"), with a leading `aria-hidden` tick icon.
  - `sets` = the sets logged in this session for the item just finished.
  - It's hidden when UF-09.6 follows the warm-up or UF-09.1 (the first exercise), or when the previous item has 0 logged sets (skipped).
- **UF-09.6 "Set-up time"** (`setupTime`): a visible label for the existing set-up countdown. The `role="timer"` element gets `aria-labelledby` pointing at it.
- **UF-09.1 "First up"** (`firstUp`): a caption under the countdown, then the first step.
  - With a warm-up: "Warm-up" and `warmupSummary(moves, seconds)` "3 moves · 40 s each", using D-0066's per-move time.
  - Without one: the first exercise's name and its `itemSummary`.

### 1.5 "Exercises" instead of "Library" (T-0622)
- `en.tabBar.library` and `en.screens.library` become "Exercises" (the C-02 tab and the UF-04.1 `h1`).
- Unchanged:
  - the route `/library`;
  - the screen IDs;
  - `en.screens.libraryDetail` ("Exercise");
  - lower-case uses of the noun in sentences ("The exercise library downloads…").
- User flows v2 names the tab in T-0618.

### 1.6 Suggest wording: no change
The UF-08.1 primary already reads "Suggest my workout" (`en.uf08.suggest`), which is the canvas wording.

The canvas fit line "Lower A fits: 5 exercises, 15 sets." needs a routine name, but an engine suggestion has none (D-0065). So the app keeps "Fits: 5 exercises, 15 sets + warm-up" (D-0107 §5).

## 2. Not built in this phase
Each item keeps the app's current behaviour and copy, except the four rows marked **promoted**, which §3 specs. "Deferred" items are Phase 5 ideas the owner may promote (H-34). "Rejected" items conflict with a principle, a contract or a decision.

| # | Screen | Canvas shows | Disposition | Why |
|---|---|---|---|---|
| 1 | UF-09.3 | "Each side 25 + 15 kg" plate loading | **promoted (§3.1, D-0217)** | was deferred: D-0066 §13, no bar or plate inventory. D-0218 adds one |
| 2 | UF-02.1 | "Hi, Anna." | rejected | no name is stored (data model, privacy) |
| 3 | UF-02.1 | "Latest PR Back Squat 100 kg × 8" | **promoted (§3.2, D-0217)** | was deferred: new content on Today. Engine rule 15 defines a PR (D-0219) |
| 4 | UF-02.1 | "Not feeling it? Quick 20-min or empty" | **"Quick 20-min" promoted (§3.3, D-0217)**; "or empty" stays deferred | an empty workout is a new start path with no engine plan |
| 5 | UF-02.1, UF-02.2, UF-08.1 | the routine name as the hero ("Lower A.", "Lower A fits") | deferred | engine suggestions have no routine name (D-0065) |
| 6 | UF-08.2 | "glutes 10/12 sets this week" | rejected | a weekly count conflicts with the 14-day window |
| 7 | UF-08.3, UF-05.1 | "Always use this in Lower A" / "Also replace it in my Lower A routine" | deferred | a routine write from the swap sheet |
| 8 | UF-05.1 | reason chips "Variations · Same muscles · Gym is busy" | rejected | the swap reason enum is an API contract (D-0056); the app's chips stay |
| 9 | UF-09.8 | per-option "−4 min", "New finish time", "Moves to next Lower day" | deferred / rejected | per-option minutes need engine output; carrying an item to another day is new engine behaviour |
| 10 | UF-03.3 | "kg volume" stat, "Est. 1RM about 124 kg, up 3 kg", per-exercise best rows | deferred | new calculations |
| 11 | UF-03.3 | a 3-point effort ("Too easy · About right · Too hard") | rejected | the effort scale is 1–5 in the data model (D-0030) |
| 12 | UF-04.1 | group filters ("Legs"), "In plan · Variant · Beginner" tags, a result count | **promoted (§3.4, D-0217)**; the "· squat pattern" suffix is rejected | the library has no movement-pattern field |
| 13 | UF-04.2 | a cue table (Depth · Bar · Knees), "Illustration, looped" | deferred / rejected | cue data isn't in the library; no illustrations ship (D-0192) |
| 14 | UF-06.1 | "3-week streak", "Recent records" | deferred | new content |
| 15 | UF-06.1 | "Weekly sets per muscle" | rejected | conflicts with the 14-day window; the app's 14-day Balance card stays |
| 16 | UF-06.2 | an "Est. 1RM" chart, "+19 kg in 12 weeks" | deferred | a new calculation; the app shows Best set, Heaviest and Sessions (T-0307b) |
| 17 | UF-07.1 | "Progression rule · Double progression · 10 % deload" | rejected | progression is engine rule 14 and isn't a user setting |
| 18 | UF-01.1 | "[App name]" | rejected | a placeholder; the app shows "workout LAB" (D-0194) |
| 19 | UF-01.2 | a "Lose fat" goal | rejected | the goal enum is in the data model |
| 20 | UF-01.3, UF-01.4 | level description lines, a "Session length" choice, an "Upper / Lower." plan preview | deferred | new onboarding inputs; principle 5 needs a timing check first |
| 21 | UF-10.2 | "63 % below target", "2 days since last trained" | layout only | the restyle may set the value first using the existing strings; no copy change |

Big titles end with a full stop ("Progress.", "Balance."). That's drawn by CSS (`.wl-title--stop`, T-0589), so the DOM text and the accessible names are unchanged.

## 3. Promoted by the owner (H-34, 2026-10-09; D-0217)
The owner promoted four §2 rows into the redesign as real features: plate loading (row 1), Latest PR on Today (row 3), the "Quick 20-min" link (row 4) and library filters and tags (row 12). Each ships after the restyle of its folder, as its own tickets (D-0217 §3). Owner questions on the defaults below are H-36…H-39; work proceeds on the defaults.

Units: the app is kg-only. Every weight is stored and shown in kg (`weight_kg`, `increment_kg`), and there is no unit setting. lb display is out of scope (H-38).

### 3.1 UF-09.3 plate loading (T-0631 → T-0632 → T-0633, T-0634)
**Canvas:** "In session · set" (#turn-3, line "Each side | 25 + 15 kg"), and the lift frames of rounds 4–5 ("25 + 15 kg each side."). The canvas numbers fit a 20 kg bar: (100 − 20) / 2 = 40 = 25 + 15.

**Data (D-0218, a data-model change).** Two new `profiles` columns. Both are synced, exported with the profile row (UF-11.4 export) and survive sign-out:
- `bar_kg numeric(5,2) not null default 20`, check `0 <= bar_kg <= 50`.
- `plates_kg numeric(5,2)[] not null default '{25,20,15,10,5,2.5,1.25}'`: the plate sizes the user has, one entry per size. The user is assumed to have **as many pairs of each size as needed**. Check: one-dimensional, lower bound 1, `cardinality <= 12`, every element `> 0` and `<= 50`, no duplicates. An empty array is allowed (bar only).

**Where the line shows.** UF-09.3 Current set only, as one line directly under the weight × reps line and above the cue. Never on UF-09.4, UF-09.5, UF-09.6, UF-03.1 or UF-08. It shows only when **all** of these hold:
- the exercise's `equipment` includes `"barbell"`, `externalLoad` is true and `timed` is false;
- the set's shown weight `W` (the pre-fill, the in-session pre-fill after an edit, or the back-off weight, whatever UF-09.3 shows) is a number, not null;
- `W >= bar_kg`;
- an exact loading exists (below).

**Loading rule** (pure, in `features/UF-09/plates.ts`):
- Per side `P = (W − bar_kg) / 2`, computed in whole hundredths of a kg. When `W − bar_kg` in hundredths is odd, there is no exact loading.
- `P = 0` gives "Bar only".
- Otherwise: the multiset of sizes from `plates_kg` (each usable any number of times) that sums to exactly `P` with the **fewest plates**. Ties go to the combination whose list, sorted largest first, is lexicographically greatest (so 20 + 10 beats 15 + 15).
- No exact combination gives no line. The line never shows a "closest" load.

**Copy** (`flows/uf-09.ts`):

| Key | Text |
|---|---|
| `platesLabel` | "Each side" |
| `platesValue(list)` | "25 + 15 kg" (sizes largest first, joined by " + ", formatted with at most 2 decimals and no grouping, then " kg") |
| `barOnly` | "Bar only" |

Markup: `<p data-part="plates"><span>Each side</span> <span>25 + 15 kg</span></p>`. "Bar only" replaces the whole line (no "Each side"). It is plain text, not a live region, and not interactive.

**Worked examples** (defaults unless stated):

| Bar | Plates | W | Line |
|---|---|---|---|
| 20 | default | 100 | Each side 25 + 15 kg |
| 20 | default | 60 | Each side 20 kg |
| 20 | default | 102.5 | Each side 25 + 15 + 1.25 kg |
| 20 | default | 140 | Each side 25 + 25 + 10 kg |
| 20 | default | 20 | Bar only |
| 20 | default | 15 | none (below the bar) |
| 20 | default | 101 | none (40.5 per side needs a 0.5) |
| 20 | default | 100.01 | none (odd hundredths) |
| 20 | 20, 15, 10 | 80 | Each side 20 + 10 kg (tie with 15 + 15) |
| 20 | 15, 10 | 60 | Each side 10 + 10 kg (greedy 15 would fail) |
| 20 | none | 60 | none |
| 20 | none | 20 | Bar only |
| 15 | default | 55 | Each side 20 kg |
| any | any | dumbbell, cable, machine or bodyweight exercise | none |
| any | any | null weight (a first-time lift with no pre-fill) | none |

**Settings: UF-11.4 Account settings, "Bar and plates" section** (T-0633), directly under the equipment section and built the same way (C-03 checkboxes, its own Save):
- Legend "Bar and plates". Hint "Shown during a set as the plates to load on each side. You have pairs of every plate you tick."
- "Bar weight (kg)": a decimal input (`inputmode="decimal"`; a comma or a point, up to 2 decimals, parsed in `features/UF-11`), 0–50, pre-filled from the cached `bar_kg`. An out-of-range or unparsable value disables Save and shows "Enter a bar weight from 0 to 50 kg." under the input.
- Plate checkboxes, largest first: 25, 20, 15, 10, 5, 2.5, 1.25, 0.5 kg, each labelled "{n} kg". A stored size that isn't in this list shows as one more checked box at its place in size order and is kept unless unticked.
- Save: `profiles.update({ bar_kg, plates_kg })` for this user, then `refreshAll`, the same as the equipment Save. Copy: "Save", "Saving", "Saved", "Connect to save", "Couldn't save your bar and plates. Try again.", and a cold cache "Your bar and plates aren't on this device yet."
- Offline: the inputs stay readable; Save is disabled with "Connect to save".

**Edge cases:**
- **Zero history / new user:** the column defaults apply (20 kg bar, the default plates), so the line works from the first set.
- **Offline:** UF-09 reads the cached profile, so the line is identical offline. A cached profile row written by an older build (no bar or plates) reads as the defaults until the next refresh (T-0632).
- **No cached profile at all:** the defaults.
- **No plates possible:** no line (see the table); the weight and cue are unchanged.
- **Weight changed on UF-09.4:** the next UF-09.3 shows the new in-session pre-fill and its own line.
- **Time running out / UF-09.8 trims:** no effect; the line follows whichever set UF-09.3 shows.
- **Returning after 10 days off:** rule 14's re-entry weight gets its own line, like any weight.

### 3.2 UF-02.1 Latest PR (T-0635 → T-0636)
**Canvas:** "Today" (#turn-3): "Latest PR Back Squat 100 kg × 8", between the plan card and Start.

**Definition (engine rule 15, D-0219, an engine-rules change).** D-0068 §5 already says record logic belongs in `packages/engine` with worked examples. The engine gains a pure `records(history, library)`:
- **Input sets:** `normalizeHistory(history)` (dedupe, tombstones dropped), then only hard sets (`isHardSet`) of exercises in the library with `kind = "exercise"`.
- **Key:** for a timed exercise, `durationS`. Otherwise the pair (`weightKg ?? 0`, `reps ?? 0`), compared weight first, then reps. Owner amendment (H-36, D-0219): ranked by estimated 1RM (Epley `w × (1 + reps/30)`) instead of D-0068 §5's heaviest-then-reps order. A bodyweight lift (weight 0) is compared on reps.
- **Per session:** for each (exercise, session), its best set is the highest key. Ties go to the earlier `completedAt`, then the smaller `clientId`.
- **A record** is a session's best set when the same exercise has at least one hard set in **another** session with an earlier `completedAt`, and the best set's key is **strictly greater** than every such earlier set's key. So the first session of an exercise is never a record, and matching a best is not a record.
- **Output:** `{ exerciseId, sessionId, clientId, completedAt, weightKg, reps, durationS, previous: { weightKg, reps, durationS } }`, oldest first (`completedAt`, then `clientId`). No clock, no time zone, no randomness.
- **Baseline:** whatever history the caller passes. The web passes `loadEngineHistory()` (the cached 56 local days plus the queue, D-0034 §3), so a "PR" means the best within the history on this device (H-37).

**What Today shows** (`features/UF-02`, T-0636):
- The latest record (greatest `completedAt`, then `clientId`) whose local date is within the last 14 local days (today − 13 … today, in Today's `timeZone`; the same window as balance).
- One line, placed after the suggestion card and the empty or attention lines, directly above Start: `<p data-part="latest-pr"><span>Latest PR</span> <span>Back Squat 100 kg × 8</span></p>`. Plain text, not a link.
- Copy (`flows/uf-02.ts`): `latestPr` "Latest PR"; `prWeighted(name, weight, reps)` "Back Squat 100 kg × 8" (used when `weightKg > 0`); `prReps(name, reps)` "Push-up 25 reps" ("1 rep"); `prTimed(name, seconds)` "Plank 90 s". Numbers use at most 2 decimals and no grouping. The name is the library name.
- Only in the `ready` state. Never in `loading` (no skeleton) or `no-plan`.

**Edge cases:**
- **Zero history:** no record, no line.
- **One session of each exercise only:** no record, no line.
- **Returning after 10 days off:** a record from 10 days ago still shows (within 14 days). One from 15 days ago doesn't. The first session back is compared with the cached history; if every earlier set is older than the 56-day cache, it is a first session and not a record.
- **Offline:** computed from the cache and queue, so a set logged offline can be the Latest PR before it syncs.
- **A record set deleted later:** it's gone after the next cache read, and the session's next-best set may become the record.
- **Warm-up sets** never count, on either side of the comparison.
- **An exercise removed from the library:** its sets are skipped.
- **Midnight-crossing workouts:** the record's local date is its own `completedAt` date.

### 3.3 UF-02.1 "Not feeling it? Quick 20-min" (T-0637 → T-0638)
**Canvas:** "Today" (#turn-3) under Start: "Not feeling it? Quick 20-min or empty". Round 5 "or a quick 20-minute one".

**Scope:** the "Quick 20-min" link only. "or empty" (an empty workout) stays deferred (§2 row 4): it has no engine plan.

**Principles 2 and 3.** The link doesn't build or start a workout. It opens **UF-08.1 with 20 minutes chosen**. UF-08.1 still shows the time (the 20 chip pressed, the stepper at 20, "done by HH:MM"), the warm-up toggle, energy and Skip today, and the user still taps "Suggest my workout", which calls the normal `suggest` path with `budgetMin = 20`. Nothing else differs from tapping Start and picking the 20 chip.

**Today (T-0638):**
- A line directly under Start: `<p data-part="quick">Not feeling it? <a href="/session/setup?budget=20">Quick 20-min</a></p>`.
- Copy (`flows/uf-02.ts`): `quickLead` "Not feeling it?", `quickLink` "Quick 20-min". The link's accessible name is "Quick 20-min"; the sentence gives its context (WCAG 2.4.4, in context).
- Shown wherever Start shows (the `loading` and `ready` states, including with a "Workout in progress" card). Hidden in `no-plan`, like Start.
- It's a text link in the plan state's secondary style, never a second primary button (Start stays the one primary).

**UF-08.1 (T-0637):**
- UF-08.1 reads `budget` from the URL **once, at mount**. An integer from 15 to 120 (`MIN_BUDGET`…`MAX_BUDGET`) becomes the initial `budgetMin`, and the matching chip is pressed when it is one of 20/30/45/60/90. Anything else (missing, `abc`, `12`, `121`, `20.5`) gives the default 45.
- Changing the time on UF-08.1 or UF-08.2 works as today. The param never overrides a later change, and moving to `step=suggested` doesn't need to keep it.
- Every other UF-08 entry (Start, UF-02.2 Preview, a reload without the param) is unchanged.

**Edge cases:**
- **Offline:** works; UF-08 suggests on the device.
- **Zero history:** the normal first-workout suggestion at 20 min.
- **Returning after 10 days off:** the normal suggestion at 20 min (rule 14 re-entry weights).
- **Time running out:** 20 min is the budget, so UF-09.8 checks against 20 as usual.
- **Nothing fits in 20 min:** UF-08.1's existing "nothing fits" line, unchanged.

### 3.4 UF-04.1 filters, result count and tags (T-0639 → T-0640)
**Canvas:** "Exercises" (#turn-3): chips "All · Legs · Glutes · Back · My equipment", "6 results · squat pattern", and the row tags "In plan", "Variant" and "Beginner".

**What exists today:** search, the chips "All", the nine areas and "My equipment", and the "Not suggested" and "Favorite" tags (D-0199, D-0202).

**Group chips (T-0639):**
- Two group chips go between "All" and the nine area chips: "Upper" (chest, back, shoulders, arms) and "Legs" (glutes, quads, hamstrings, calves). Core has no group, because its area chip is the same set.
- A group matches an exercise with weight 1.0 in **any** of its areas, the same primary-area rule the area chips use.
- All, the groups and the areas are one single-choice set (pressing one releases the others). "My equipment" stays an independent toggle and combines with any of them, as today.
- URL: `group=upper|legs`, written with `replace` like `area`. Pressing a group deletes `area`; pressing an area deletes `group`. A URL with both uses `area` and ignores `group`; an unknown `group` is ignored.
- Copy (`flows/uf-04.ts`): `chipUpper` "Upper", `chipLegs` "Legs".

**Result count (T-0639):**
- `resultCount(n)`: "6 results", "1 result". It sits between the chips and the list and counts the rows shown.
- It's a polite live region (`role="status"`), so a screen reader hears the new count after a search or chip change.
- When no row matches, the existing "No exercises match …" message shows instead, and the count isn't rendered.
- The canvas suffix "· squat pattern" is not built: the library has no movement-pattern field.

**Tags (T-0640):** one tag per row, the first that applies in this order:

| Tag | Applies when | Screen-reader text |
|---|---|---|
| "Not suggested" (existing) | the exercise is excluded (D-0199) | ", not suggested" |
| "Favorite" (existing) | it's a favorite (D-0202) | ", favorite" |
| "In plan" | its id is an item of any cached routine (`loadRoutines()`) | ", in your routines" |
| "Variant" | it isn't in a routine, and `exercise_variants` links it to an exercise that is (`loadVariants(id)` of each in-routine exercise) | ", variant of an exercise in your routines" |
| "Beginner" | `level = "beginner"` | ", beginner level" |

- The tag is the existing `.wl-uf04__tag` text tag with the existing `.wl-uf04__sr` prefix. It is never a control.
- Copy (`flows/uf-04.ts`): `inPlan`/`inPlanSr`, `variant`/`variantSr`, `beginner`/`beginnerSr`, as in the table.

**Edge cases:**
- **Zero history / no routines:** no "In plan" or "Variant" tags; "Beginner" still shows.
- **Offline:** all of it reads the device cache (library, routines, variants, excluded, favorites), so the screen is identical offline.
- **Cold cache (never online):** the existing "The exercise library downloads…" line; no chips, count or tags.
- **A routine changed on another device:** the tags follow the cache after the next refresh.
- **Back from UF-04.2:** the URL keeps `q`, `area` or `group` and `mine`, so the same list, count and tags return.
