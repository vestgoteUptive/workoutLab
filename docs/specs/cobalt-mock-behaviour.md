# Cobalt mock: new behaviour and copy (D-0212)

- **Source:** the canvas `Design-docs/docs/design/redesign-cobalt/canvas/Design Directions.dc.html`, rounds 3–5, on branch `origin/design/redesign-cobalt`. Read it with `git show`; it is never copied into `main`.
- **Read against:** the app on `main` at 4b59a1d (2026-10-09): `apps/web/src/lib/i18n/en.ts` and `flows/*.ts`, and the feature views.
- **Owner answer (2026-10-09):** "include the new behaviour and copy shown in the mock", specced as real work and kept separate from the pure restyles.
- **Written by:** product-owner (groom).

The README still says "behaviour, copy and flows are unchanged" (D-0208 §6). D-0212 amends that for the items in §1 only. Everything in §2 keeps the app's behaviour and copy. A restyle ticket never changes a string; only the §1 tickets do.

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
Each item keeps the app's current behaviour and copy. "Deferred" items are Phase 5 ideas the owner may promote (H-34). "Rejected" items conflict with a principle, a contract or a decision.

| # | Screen | Canvas shows | Disposition | Why |
|---|---|---|---|---|
| 1 | UF-09.3 | "Each side 25 + 15 kg" plate loading | deferred | D-0066 §13: there's no bar or plate inventory, so it needs a data-model change |
| 2 | UF-02.1 | "Hi, Anna." | rejected | no name is stored (data model, privacy) |
| 3 | UF-02.1 | "Latest PR Back Squat 100 kg × 8" | deferred | new content on Today; PRs exist on UF-03.3 and UF-06 |
| 4 | UF-02.1 | "Not feeling it? Quick 20-min or empty" | deferred | a new start path; UF-08.1 already has a 20-min chip |
| 5 | UF-02.1, UF-02.2, UF-08.1 | the routine name as the hero ("Lower A.", "Lower A fits") | deferred | engine suggestions have no routine name (D-0065) |
| 6 | UF-08.2 | "glutes 10/12 sets this week" | rejected | a weekly count conflicts with the 14-day window |
| 7 | UF-08.3, UF-05.1 | "Always use this in Lower A" / "Also replace it in my Lower A routine" | deferred | a routine write from the swap sheet |
| 8 | UF-05.1 | reason chips "Variations · Same muscles · Gym is busy" | rejected | the swap reason enum is an API contract (D-0056); the app's chips stay |
| 9 | UF-09.8 | per-option "−4 min", "New finish time", "Moves to next Lower day" | deferred / rejected | per-option minutes need engine output; carrying an item to another day is new engine behaviour |
| 10 | UF-03.3 | "kg volume" stat, "Est. 1RM about 124 kg, up 3 kg", per-exercise best rows | deferred | new calculations |
| 11 | UF-03.3 | a 3-point effort ("Too easy · About right · Too hard") | rejected | the effort scale is 1–5 in the data model (D-0030) |
| 12 | UF-04.1 | group filters ("Legs"), "In plan · Variant · Beginner" tags, a result count | deferred | new filtering and tags |
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
