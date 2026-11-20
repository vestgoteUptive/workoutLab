# RIR progression and own weight steps — spec

- **Idea:** the owner, 2026-11-20, inspired by the open-source app wger's progression rules: "use RIR for progression" and "own weight step per exercise" (1.25 kg instead of 2.5 for gyms with micro plates).
- **Screens:** UF-04.2 Exercise detail (new "Weight step" row). Read-only effects on UF-09.4 Confirm set (the weight stepper already uses the exercise step) and wherever the pre-fill reason is shown. User flows v2 (D-0002). Nothing is added to UF-01, UF-08 or UF-09.1–.9.
- **Decisions:** D-0250 (RIR gates the weight increase), D-0251 (own weight step, new table), D-0252 (engine inputs and purity, explanation code), D-0253 (v1 scope and open-question defaults). Amends D-0026 (its "RIR is logged but not used in v1" clause; the owner's request is the reopening that its "Revisit when" asks for). Builds on D-0057, D-0062, D-0131, D-0137, D-0061/D-0095 (rep ranges), D-0017 (kg only), D-0199/D-0202 (per-user exercise lists, the table precedent).
- **Status:** accepted, 2026-11-20. The owner accepted every open-question default; the impact-review rulings are in D-0259 (amends D-0250 to D-0253, which are `decided`). Where this spec and D-0259 differ, D-0259 wins; the spec below is amended to match. Board section "RIR progression and own weight steps".
- **Principles:** 3, deterministic engine (RIR is one more number in the history input; the rule is a pure function of history, `now` and the library). 5, onboarding under 60 s: no setup, defaults unchanged. 1 and 2: untouched (no change in focus mode, no change to the time budget). 4: progression only, targets untouched.

## Problem
Rule 14 raises the weight when every set at the top weight reached the top of the rep range. It ignores how hard those sets were. A user who grinds out 8, 8, 8 at RIR 0 gets +2.5 kg next time and probably fails; a user who did 8, 8, 8 at RIR 4 is told the same. The app already asks for reps in reserve on every set (UF-09.4, `session_sets.rir`, D-0021) and then throws the answer away (D-0026).

Separately, `increment_kg` is a library value (2.5 for most exercises). A gym with 1.25 kg micro plates, or a user who wants 5 kg jumps on leg press, can't change it. The pre-fill and the High-energy back-off floor (D-0131) are then off-grid for them, and the +/- weight stepper on UF-09.4 steps by the wrong amount.

## Earlier decisions on RIR
- D-0026 (decided, confirmed by the human in D-0061): "RIR is logged but not used in v1." Reason given: too little RIR data. Its "Revisit when" trigger is "there is enough RIR data to use it, or users edit the pre-filled weight on more than 30 % of sets". The owner has now asked for it, so D-0250 amends only that clause. No decision rejected RIR use on the merits.
- D-0057, D-0062, D-0131, D-0137 only shaped rule 14's edges (bodyweight, unusable sessions, the drop floor, the back-off floor). None touches RIR.
- RIR is optional on UF-09.4 (the set auto-saves after 5 s unless touched), so many sets have `rir = null`. The design below treats null as "no signal" and keeps today's behaviour, so a user who never logs RIR sees no change at all.

## What changes in rule 14 (a)
RIR is read only from **sets at `W`** in the **last session** (the same set group rule 14 already uses for `minReps`). Warm-ups, back-off sets (lighter than `W`), tombstones and null-reps sets are already excluded. Define:

- `rirMin` = the lowest non-null `rir` among the hard sets at `W` in the last session, or `none` when no set at `W` has a non-null `rir`.
- `effortOk` = `rirMin` is `none` or `rirMin ≥ 2`.
- `heldOnce` (D-0259 §1) = all four hold: the session before the last (a) has the same `W`, (b) has every set at `W` with reps ≥ high, (c) was itself a hold, meaning its own `rirMin` (same definition, same sets) is non-null and < 2, and (d) is less than 10 local days before the last session (the gap count used by steps 2–3). Otherwise false.
- `rirMin` is taken over the sets used for `minReps`; a non-integer or out-of-range `rir` counts as null.

Step 4 becomes two steps. All other steps, their order and their output stay as they are. Exact rule 14 text (D-0259 §2):

4. Loaded, every set at `W` has reps ≥ high, and (`rirMin` is none or ≥ 2, or `heldOnce`): `W + inc`, low reps (`increase`). Bodyweight stays on this step: 0 at high reps (`increase`), `rir` never read (no weight to hold).
4b. Loaded, every set at `W` has reps ≥ high, otherwise: `W`, high reps (`hold_effort`). The user repeats the top of the range and is told why. Timed exercises return earlier and never reach 4b (RIR is not logged on timed sets; D-0253 §4).

Rule 15 (records), balance and `timeCheck` never read `rir`, and neither do steps 1–3 and 5–7. A test shows their output is unchanged with `rir` present.

Why this shape:
- **Only the weight increase is gated.** "Hold at RIR 0" means the weight is held. Rep progression inside the range (step 7, `add_rep`) is unchanged, because adding a rep is a small step that the user can refuse and that never risks a failed set the way +2.5 kg does.
- **RIR 0 and 1 both hold; ≥ 2 increases.** The owner's example ("only increase when the top of the range was hit with RIR ≥ 2"). The lowest RIR counts, so one grinder set holds the weight.
- **At most one hold in a row (`heldOnce`).** Without it, a user who honestly logs RIR 1 on the last set every session would never progress. After one `hold_effort` at the same `W` and top reps, the next session steps up whatever the RIR. This keeps the ladder moving and stays a pure function of the last two sessions (rule 5 already reads two sessions).
- **Ladder interaction.** Steps 1–3 (first time, carry, `reentry`, `hold_after_break`) run before step 4, so a break overrides RIR: after 10+ days the weight is held or dropped as today. Step 5 (`deload`) and step 6 (`hold`) need `minReps < low`, and step 4 needs reps ≥ high, so they can never both match: no new ordering conflict. `deload` still compares reps only (RIR does not trigger a deload in v1).
- **Missing RIR.** Absent, null or a session logged before RIR existed: `effortOk` is true, so step 4 behaves exactly as today. Old history is unchanged, and the engine's existing simulated histories still pass without edits.

### Worked examples (goal `build_muscle`: main lift 6–8, other compounds 8–12, isolation 10–15; `inc` = 2.5 unless stated; `D` = the local date of `now`)
- **R14-E10 (hold at RIR 1)** bench-press as the main lift, 09-24, 80 × 8 at RIR 2, 2, 1: `rirMin` 1, no earlier session: 80 × 8 (`hold_effort`). Today it is 82.5 × 6.
- **R14-E11 (increase at RIR ≥ 2)** the same, RIR 3, 2, 2: `rirMin` 2: 82.5 × 6 (`increase`).
- **R14-E12 (RIR 0 on one set)** 80 × 8, 8, 8 at RIR null, null, 0: `rirMin` 0 (nulls ignored): 80 × 8 (`hold_effort`).
- **R14-E13 (no RIR logged)** 80 × 8, 8, 8 with every `rir` null: 82.5 × 6 (`increase`), same as R14-E1.
- **R14-E14 (one hold, then up)** 09-20: 80 × 8, 8, 8 at RIR 1, 1, 0; 09-24: 80 × 8, 8, 8 at RIR 1, 1, 1. `heldOnce` is true: 82.5 × 6 (`increase`). With only the 09-24 session, it is 80 × 8 (`hold_effort`).
- **R14-E15 (the earlier session is at another weight)** 09-20: 77.5 × 8, 8, 8; 09-24: 80 × 8, 8, 8 at RIR 1: the earlier `W` differs, so `heldOnce` is false: 80 × 8 (`hold_effort`).
- **R14-E16 (a break wins)** 80 × 8, 8, 8 at RIR 0 on 09-12, `now` 09-24 (gap 12): 80 × 6 (`hold_after_break`); at gap 21+ it is `reentry` as today. RIR is not read.
- **R14-E17 (reps below the top, RIR irrelevant)** 80 × 8, 7, 6 at RIR 0 on 09-24 (high 8, low 6): 80 × 7 (`add_rep`), unchanged.
- **R14-E18 (back-off sets don't count)** main lift 09-24, 80 × 8, 8, 8 at RIR 2, 2, 2 plus a back-off 72.5 × 8 at RIR 0: `W` is 80, the back-off set is not at `W`: 82.5 × 6 (`increase`).
- **R14-E19 (bodyweight)** push-up 0 × 15, 15, 15 at RIR 0 (high 15): 0 × 15 (`increase`), unchanged.
- **R14-E20 (timed)** plank 45, 45, 40 s: unchanged, R14-E8.
- **R14-E24 (the earlier session was not a hold)** 09-20: 80 × 8, 8, 8 at RIR 3, 3, 3; 09-24: 80 × 8, 8, 8 at RIR 1: the earlier `rirMin` is 3, so `heldOnce` is false: 80 × 8 (`hold_effort`).
- **R14-E25 (the earlier hold is stale)** 09-12: 80 × 8, 8, 8 at RIR 0; 09-24: 80 × 8, 8, 8 at RIR 1 (gap 12 days between the two sessions, `now` 09-25): `heldOnce` is false (gap ≥ 10): 80 × 8 (`hold_effort`).

## What changes in rule 14 (b): own weight step
`inc` in rule 14, `floorInc`, the drop floor (D-0057 §4, D-0137) and the High-energy back-off floor (D-0131) all read `exercise.incrementKg ?? 2.5`. The user's override replaces that value for that exercise. No rule changes: the engine only receives a different `incrementKg` (D-0252 §2).

- **R14-E21 (own step)** db-curl (isolation 10–15, library 2.5, user step 1.25), 20 × 15, 15, 15 at RIR 3, 2, 2: 21.25 × 10 (`increase`). Without the override: 22.5 × 10.
- **R14-E22 (deload on the grid)** back-squat 102 × 5, 5, 4 on 09-20 and 102 × 5, 4, 4 on 09-24, step 1.25: `floorInc(91.8)` = 91.25: 91.25 × 6 (`deload`). With 2.5 it is 90 × 6.
- **R14-E23 (back-off)** High energy, bench-press pre-fill 80 × 6, step 1.25: `floorInc(72)` = 71.25 × 6. With 2.5 it is 70 × 6 (R14-E9).
- A step change never rewrites history. Next session's pre-fill is `W + new step`, where `W` is the last weight actually lifted (it may be off the new grid; only the increase is one new step).

## Where the user sets the step (UF-04.2 only)
- **Screen:** UF-04.2 Exercise detail, a "Weight step" row below the Favorite / "Don't suggest this" actions. Shown only when the exercise has an external load and is not timed. Never in UF-09 (principle 1), UF-01 or UF-08.
- **Control (D-0259 §7–§10):** a `role="radiogroup"` labelled "Weight step" (not `aria-pressed` chips) with "1.25 kg", "2.5 kg", "5 kg" and "Other"; roving tabindex; each at least 44 px; selected = `--wl-selected` plus a check mark. The chip equal to the library default is a reset (deletes the row). A text button "Use default ({n} kg)" shows only while an override exists. Visible text "Weight step: 1.25 kg (yours)" or "(default)". Helper line "How much the weight goes up each time." One `role="status"` line, present on mount, confirms "Weight step set to 1.25 kg." / "Weight step back to the default, 2.5 kg." A failed save shows `role="alert"` "Couldn't save. Try again." and reverts. No undo.
- **"Other":** `inputmode="decimal"`, label "Step in kg", a Save button; Cancel and Escape restore. Validate on Save and blur, with `aria-invalid` and `aria-describedby`. An off-list value (1.5) keeps Other selected and shows "Other: 1.5 kg".
- **Defaults:** no row means the library `increment_kg`. Onboarding asks nothing (UF-01 untouched).
- **Validation:** a multiple of 0.25, from 0.25 to 10 kg inclusive. Anything else shows the inline error "Enter a step from 0.25 to 10 kg, in multiples of 0.25." and saves nothing. The database enforces the same range (check constraint). Comma or dot decimal is accepted on input, shown through `Intl`.
- **Hidden, not disabled,** for timed and bodyweight exercises; one shared external-load predicate (in `packages/shared`) serves the UI and the engine.
- **Offline (D-0259 §13):** the row stays editable offline. D-0199 and D-0202 disable UF-04.2 controls offline only where the write has no queue; this one has a device store and a queue (favorites pattern), so it is a stated carve-out. No "Connect to change..." copy here.
- **Units:** kg only (D-0017). No lb conversion.
- **Effect:** the next pre-fill (UF-08.2 plan, UF-09.3/UF-09.4), the back-off floor, and the +/- steps of the weight stepper on UF-09.4 (`confirm-set.tsx` already uses `exercise.incrementKg`). The step is shown and edited only on UF-04.2 (v1 keeps one place).
- **Does not change:** a set already logged, a set in a running workout (the pre-fill shown now stays; the new step applies from the next pre-fill computation).

## Data model (D-0251; data lane writes `docs/data-model.md` and the migration)
New user-owned table `exercise_settings`, in the family of `excluded_exercises` and `favorite_exercises` (D-0199, D-0202), one row per exercise **only while an override exists** (reset = delete the row).

| column | type | null | default | notes |
|---|---|---|---|---|
| user_id | uuid | no | `auth.uid()` | FK `auth.users(id)` on delete cascade. |
| exercise_id | text | no | | FK `exercises(id)` on delete cascade (a setting is a preference, not history; same as D-0199 §4). |
| increment_kg | numeric(4,2) | no | | Check `increment_kg between 0.25 and 10` and `increment_kg * 4 = round(increment_kg * 4)`. |
| created_at | timestamptz | no | `now()` | Server-set. |
| updated_at | timestamptz | no | `now()` | Server-set on every write; the last write wins (D-0020). |

- Keys: PK `(user_id, exercise_id)`; index on `(exercise_id)`.
- Trigger `exercise_settings_before_write`: insert sets `created_at` and `updated_at` := `now()`; update keeps `user_id`, `exercise_id` and `created_at`, sets `updated_at := now()`. Client values for these are ignored.
- RLS: select, insert, update and delete for the owner (`authenticated`); `anon` has no privileges.
- Plain CRUD through supabase-js with `upsert(onConflict: 'user_id,exercise_id')`; no Edge Function and no `api/openapi.yaml` change (D-0001). The export (D-0200 §1, `apps/web/src/lib/account/export.ts`) includes the table, ordered by `exercise_id`, and the table is on the D-0017 account-delete list; both are tested (T-0951).
- **`session_sets.rir` already exists** (`smallint`, check 0–5, nullable) and is already written by UF-09.4. No column, migration or openapi change for (a).
- Why a table and not a `profiles` column: it is per exercise, grows only with use, deletes with the exercise, and matches the two precedents. Why generic name `exercise_settings`: later per-exercise settings (rest time) become columns, but v1 has exactly one, not null.

## Engine impact (D-0252; engine lane writes rule 14 text and examples)
- **Inputs.** `HistorySet` gains `rir?: number | null` (absent ≡ null). `prefill` keeps its signature. The per-exercise step travels in `LibraryExercise.incrementKg`: the web layer builds an **effective library** (library rows with `incrementKg` replaced where the user has an override) and passes it to every engine call (`suggest`, `prefill`, `applySwap`, `insertItem`, `rankSwaps`). Both `prefill.ts:226` and `session.ts:430` then agree on one step. No new parameter and no new engine contract.
- **Purity and determinism.** Rule 14 stays a pure function of `(exercise, slot, history, library, now, tz, previous)`. RIR is a number in the history, never read from a clock, store or model. Same inputs, same output. No LLM is involved.
- **Validation.** A non-integer or out-of-range `rir` (not in 0–5) in `HistorySet` is treated as null (the database check already guarantees range; the engine does not throw on history rows, as for other optional fields). An `incrementKg` ≤ 0 keeps today's behaviour (`RangeError` or default, whatever rule 14 does now).
- **Explanation (rule 10).** The `prefill` reason kind gains `hold_effort`. It carries no extra fields in v1 (the text can't depend on more than the kind). `increase` text is unchanged.
- **Server (D-0259 §15, T-0959).** `POST /workouts/suggest` (`supabase/functions/workouts/core.ts`) reads the caller's `exercise_settings` through the user's RLS client and builds the same effective library, so server and client agree. No openapi change. `database.gen.ts` gains the table (T-0951).
- **Back-compat.** Absent `rir` everywhere leaves every existing R14 example and simulated history unchanged. Engine changes need the simulated 14-day histories: add one history with RIR 2 progressing, one with RIR 0 holding once then stepping up, and one with a changed step.

## Offline and sync
- **RIR** is already stored with each queued set (`queued.rir`) and flows to history with `pending: true` sets. The web history mapper must pass `rir` through for both server rows and queued rows, so a set logged offline at RIR 0 holds the weight in the very next pre-fill, still offline. Path (D-0259 §14): the shared `toHistorySet` (`packages/shared/src/mappers.ts`) picks `rir`; the `session_sets_live` select includes `rir` (check the view exposes it); `CachedHistorySet` gains `rir` with an IndexedDB upgrade from v4 (old rows null until refresh); `history.ts` copies it; the queued-set mapper maps `queued.rir`.
- **Step override** follows the favorites precedent: stored on the device first (the effective library uses it at once), queued like other writes, `upsert` when online, last write wins by `updated_at`. A reset is a queued delete. A pre-fill computed offline uses the device value. Two devices: the later write wins and the other converges on the next sync; nothing breaks, because the engine takes whichever step it is given.
- **Zero history, new exercise, returning after 10 days off:** a step with no history changes nothing until a first session exists; after a break rule 14 steps 2–3 apply as today and the step only sets the floor and grid.

## Edge cases
- Zero history: no RIR, step unused until first lift. `first_time` unchanged.
- Time running out in a workout: RIR is optional, nothing blocks Done set; the pre-fill is a pure read of history.
- Mixed logging: three sets, one with RIR: the logged one counts.
- RIR 5 on every set at the top reps: `increase` (≥ 2); no double jump in v1.
- User edits a logged set's RIR afterward: the next pre-fill uses the edited value (history is the source).
- A step of 10 kg on a 20 kg lift: allowed (it is the user's choice); the drop floor is still capped at `W` (D-0137).
- Exercise removed from the library: the setting row cascades away.

## Acceptance criteria (each is at least one automated test)
1. Engine, step 4b: R14-E10 returns 80 × 8 `hold_effort`; R14-E12 (a null set ignored, a 0 counts) the same.
2. Engine, step 4: R14-E11 returns 82.5 × 6 `increase`; R14-E13 (all null) is identical to R14-E1.
3. Engine, `heldOnce`: R14-E14 returns 82.5 × 6 with two sessions and 80 × 8 `hold_effort` with one; R14-E15 holds (different earlier `W`); R14-E24 holds (earlier session not a hold); R14-E25 holds (gap ≥ 10 days).
4. Engine, ladder: R14-E16 (break) ignores RIR; R14-E17 and R14-E18 are unchanged; R14-E19 and R14-E20 are unchanged.
5. Engine, own step: R14-E21, R14-E22 and R14-E23 give the listed values, and `suggest` with the effective library uses the same step as `prefill` for the back-off.
6. Engine properties (seeded with an inline mulberry32 PRNG, no fast-check, ≥ 200 cases; rule 15, balance and `timeCheck` output unchanged with `rir` present; invalid `rir` is null): for random histories with all `rir` null, output equals today's; rule 14 is deterministic and never returns a weight below `W` except steps 2 and 5; a user who logs RIR ≤ 1 at top reps gets `hold_effort` at most once in a row.
7. Data: `exercise_settings` migration matches `docs/data-model.md`; RLS: a user can read and write only their own rows, `anon` none; the checks reject 0, 0.1, 10.25, 11 and accept 0.25, 1.25, 10; deleting the exercise cascades.
8. Web: the history mapper passes `rir` for server and queued sets; an offline set at RIR 0 changes the next pre-fill to `hold_effort` with no network.
9. Web UF-04.2: choosing "1.25 kg" saves and the status line says so; "Use default" removes it; an invalid "Other" value (0.1) shows the error and saves nothing; the row is hidden for a timed or bodyweight exercise.
10. Web: the pre-fill, the back-off and the UF-09.4 +/- stepper all use 1.25 after the override (one effective-library test); with the device offline the override applies and syncs later.
11. Explanation: a `hold_effort` pre-fill shows the copy below; no copy mentions a number the engine did not output.
12. Axe: no violations on UF-04.2 with the row; chips and field are at least 44 px; the value is shown in words.
13. Onboarding: UF-01 to a first plan is unchanged (no new request, no new step); the 60 s timing test still passes.
14. Server (T-0959): `POST /workouts/suggest` with an override row gives the same back-off and pre-fill step as the client's effective library.
15. Data/web: the export includes `exercise_settings` ordered by `exercise_id`; account delete removes it; the IndexedDB upgrade from v4 keeps old history rows with `rir` null; the radiogroup is keyboard-operable (arrow keys), the default chip resets, and the row works offline.

## Explanation copy (rule 10; the design lane polishes)
- `hold_effort`: "Same weight again. Last time was close to failure. Leave a couple of reps in reserve and it goes up." No placeholders: the reason carries no fields (D-0259 §12).
- `increase`: unchanged text. (A user who logged no RIR sees today's copy.)

## Open questions (all resolved at the default that ships; owner accepted, D-0259 §17)
1. **Threshold: RIR ≥ 2 to increase?** Default: yes, as the owner said. RIR 1 holds.
2. **Which set counts?** Default: the lowest RIR among sets at `W`. Alternative: the last set only (hardest by fatigue). The lowest is simpler and safer.
3. **Escape from a permanent hold?** Default: one hold, then increase (`heldOnce`). Alternative: no escape, RIR 2 required forever. Rejected: honest loggers would stall.
4. **RIR on timed sets?** Default: not logged and not used.
5. **Hold reps on RIR 0 in the middle of the range (step 7)?** Default: no, `add_rep` unchanged. Revisit when there is data.
6. **Raise the weight by more at RIR ≥ 4 (double jump)?** Default: no.
7. **Should RIR 0 or very low RIR across two sessions trigger a deload?** Default: no, reps only (rule 5).
8. **Nudge users to log RIR (it is optional and auto-saves)?** Default: no change to UF-09.4 in v1; the empty RIR keeps today's behaviour. Revisit when fewer than about a third of sets carry RIR.
9. **Where to edit the step.** Default: UF-04.2 only. A shortcut on UF-09.9 (Pause) is out of v1.
10. **Allowed values.** Default: multiples of 0.25 from 0.25 to 10 kg. Alternative: a fixed list.
11. **Does a changed step round the last weight onto the new grid?** Default: no; `W + new step`.
12. **Per-exercise table name.** Default: `exercise_settings` (one column in v1).

## Out of scope (v1)
RIR-driven target rep ranges, auto-regulation inside a session, RPE, lb units, a global step (all exercises), per-equipment steps, plate calculators, a bulk "my gym has micro plates" switch, changing UF-01 or UF-09, any LLM-chosen load.
