---
id: D-0118
title: "UF-09 set loop (T-0304b, T-0304f): T-0304b–d split into six half-day children; the UF-09.4 auto-save is a persisted 5 s wall-clock timer with AUTOSAVE_CANCEL; Save calls editSet only on a change; weights through formatKg and a new formatDecimal; cue and name sources; a chrome announcer for rest cues; placeholder button counts are updated, not dropped"
status: revisit
date: 2026-10-02
by: product-owner (groom T-0304b/c/d)
area: product
builds-on: D-0066 §3–§7 §10, D-0071 §5, D-0111 §3 §4 §8 §9 §11, D-0114 §3 §5, D-0115 §6
amends: D-0111 §4 (the confirm timer) and §8 (the expiry table), in part
---
## Context
The parent T-0304 rows for T-0304b, c and d are each about ¾ of a day once the T-0304a/e defaults
are counted in. A web build that runs past its budget dies without a result (D-0106 Context,
D-0111 Context). T-0304b alone holds five views (UF-09.1, .3, .4, .5, .6), the write path, a new
persisted timer, the in-session pre-fill and the back-off set.

Grooming the set loop also found these open points:
1. D-0111 §4 lists `confirm` with no timer, but the parent's groom note makes the UF-09.4 auto-save
   a persisted wall-clock timer (NFR-TIME-1). The event that cancels it and the expiry event are
   unnamed.
2. What counts as a "touch" on UF-09.4, and whether Pause cancels the auto-save.
3. Whether Save calls `editSet` when nothing changed (it bumps `edited_at` for nothing, D-0015).
4. How a weight is shown and typed. D-0114 §3 puts every kg value through a `lib/format` helper.
   `formatKg` (D-0115 §6) appends " kg", and callers must not cut strings apart (D-0114 §5), so a
   text input has no helper for its bare number.
5. The parent says "the library `cue`", but `LibraryExercise` has no cue. The cue lives in
   `ExerciseDetail` (`loadExerciseDetail`, the T-0319 cache).
6. The rest "Go" announcement happens at the moment the rest view unmounts (the expiry moves the
   machine on in the same commit), so an `aria-live` region inside the rest view never speaks it.
7. T-0304a AC-7 pins "exactly 1 button" per placeholder state. Real views have more buttons.

## Decision
1. **Six children, one lane, run in this order:** T-0304b → T-0304f → T-0304c → T-0304g → T-0304d →
   T-0304h. All are in lane `web-feature:UF-09`, about ½ day each.
   - **T-0304b:** UF-09.3 Current set and UF-09.4 Confirm (Done set writes first, the auto-save,
     RIR, in-session pre-fill, back-off). Deps T-0304e.
   - **T-0304f:** UF-09.1 Get ready, UF-09.5 Rest, UF-09.6 Next exercise. Deps T-0304b.
   - **T-0304c:** UF-09.2 Warm-up and UF-09.7 Timed set (D-0119). Deps T-0304f.
   - **T-0304g:** wake lock, sound and voice cues, reduced motion, which read `readFocusPrefs`
     (D-0119). Deps T-0304c and T-0303d.
   - **T-0304d:** UF-09.8 Time check, UF-09.9 Paused, Skip to next, End (D-0120). Deps T-0304c,
     not T-0304g, so that if T-0303d is late the orchestrator can run d before g. The lane still
     runs one ticket at a time.
   - **T-0304h:** the e2e that starts at UF-08.4 (reload, offline, two devices, keyboard) (D-0120).
     Deps T-0304d and T-0303d.
   - The parent's ACs map like this: B1, B7 → f; B2–B6, B8 → b; C1–C4 → c; C5–C7 → g; D1–D6 → d;
     D7–D10 → h (the UF-09.8/.9 keyboard and axe part of D10 → d).
2. **The confirm auto-save timer (amends D-0111 §4 and §8).**
   - `machine.ts` exports `AUTOSAVE_S = 5`.
   - `SET_RECORDED` enters `confirm` with `timer = {startedAtMs: atMs, durationS: AUTOSAVE_S,
     pausedMs: 0}`. The exception is a recorded `weightKg` of `null` on an exercise that isn't
     known to be bodyweight (its library entry is missing, or has `externalLoad !== false`). Then
     the timer is `null` (D-0066 §4: null means "ask").
   - A new event, `AUTOSAVE_CANCEL {atMs}`, sets `timer` to `null` in `confirm`. In any other phase,
     or with the timer already `null`, it returns the same state object.
   - The host's expiry table gains `confirm → SAVED` (no `set`). That event is dispatched once, by
     the same mechanism as the T-0304a expiries.
   - `PAUSE`/`RESUME` pause the auto-save like any other timer. Pause isn't a touch, so it doesn't
     cancel. After Resume, the countdown carries on from where it was.
   - A restore follows the T-0304a rules: a reload 3 s in shows 2 s left, and a reload 10 s in
     dispatches one `SAVED`, and the rest starts at that moment.
   - A stored `confirm` with `timer: null` is valid (cancelled, or "ask").
3. **What a touch is.** A `pointerdown` or a `keydown` whose target is inside the UF-09.4 step view
   (not the chrome) dispatches `AUTOSAVE_CANCEL` once. Edits that a touch makes (reps, weight, RIR)
   live in the view's own state. A reload restores the recorded values with no auto-save ("Tap save
   when ready."). The set that is already recorded is never lost.
4. **Save.** Save compares `{reps, weightKg, rir}` with the recorded entry.
   - If any of them differs, it calls the hook's `editSet(clientId, {reps, weightKg, rir})`, and
     after that resolves it dispatches `SAVED {set}`.
   - If none differs, there is no `editSet` call, and it dispatches `SAVED` at once. The untouched
     auto-save is the same case.
   - RIR stores 0 / 2 / 3 for None / 1–2 / 3+, or `null` when nothing is picked (D-0066 §5).
5. **Write errors stay on the step.** A rejected `recordSet` keeps UF-09.3, and a rejected `editSet`
   keeps UF-09.4, each with polite text ("Couldn't save. Tap Done set again." / "Couldn't save. Tap
   Save again."). The text sits in an `aria-live="polite"` element, never `role="alert"`
   (D-0111 §3, T-0304a AC-7). While a write is pending, a second tap makes no second call, so each
   set gets one `client_id` (NFR-SYNC-1).
6. **Weights.**
   - Every kg value on screen is `formatKg(value, locale)` (D-0115 §6). `SessionHost` takes an
     optional `locale?: string` prop. When it is absent, the runtime default is used, the UF-10
     pattern. Tests pass `"en-GB"` and the pair `"sv-SE"` ("77,5 kg").
   - The UF-09.4 weight field is a text input (`inputmode="decimal"`). Its value is
     `formatDecimal(value, locale)`, a new `lib/format/number.ts` export that T-0304b adds as a
     listed extra. It uses `formatKg`'s number options (0–2 decimals, no grouping) and has no unit.
     `formatKg` itself is unchanged.
   - Parsing (`features/UF-09/weight-input.ts`, pure) trims the text. Empty gives `null`. Digits
     with an optional single `.` or `,` and up to 2 decimals give a number. Anything else is
     invalid: Save gets `aria-disabled="true"` and the polite hint "Enter a weight like
     {formatDecimal(82.5, locale)}".
   - The steppers add or subtract the library `incrementKg`. A missing library entry steps by 2.5
     (the `docs/data-model.md` default). Weight and reps floor at 0.
   - A bodyweight exercise (`externalLoad: false`) shows no weight control and records the
     pre-fill weight, which the engine sets to 0 (D-0040 §4).
7. **What each set pre-fills (D-0066 §6).**
   - Set 1 uses `item.prefill`. A `null` `prefill.reps` falls back to `item.repsMin`.
   - Set k > 1 takes each of weight and reps from the saved entry for set k − 1. Each field falls
     back on its own to the set 1 value when the saved one is `null`.
   - The back-off set (index `item.sets`) uses `backoff.weightKg` / `backoff.reps`.
   - One pure function, `nextSetPrefill(plan, itemIndex, setIndex, loggedSets)`, computes this. UF-09.3
     and UF-09.5's "Next" line both use it.
8. **Names and cues.**
   - The exercise name is the library `name`. When the entry is missing, it is the exercise id (the
     UF-10 fallback, D-0115 §2).
   - The cue is `(await loadExerciseDetail(id))?.cue`, read from the IndexedDB cache with no refresh
     (D-0111 §11). A missing detail, or a `null` cue, renders no cue element. The read never delays
     Done set.
9. **UF-09.3 copy.** The heading is the exercise name. Then:
   - the set line "Set {n} of {item.sets}", or "Back-off set" for the back-off;
   - the load line:
     - "{formatKg} × {reps}";
     - bodyweight: "{reps} reps" ("1 rep");
     - a `null` weight on a loaded lift: "Set weight", followed by "{reps} reps".
   Plurals live in `flows/uf-09.ts` keys (D-0114 §3).
10. **One announcer in the chrome (T-0304f).** The chrome holds one persistent element with
    `aria-live="polite"` and `data-field="announcer"`. It stays mounted across steps.
    - It says "10 seconds" once, when a rest crosses `remainingS ≤ 10`.
    - It says "Go" when a rest or the UF-09.1 countdown ends by expiry. A Skip or "Start now" says
      nothing.
    - It is empty on every other tick (NFR-A11Y-4). T-0304c adds "Done" for a timed hold.
    - The rest ring's label reads "GO" whenever `remainingS` is 0.
11. **Formatter outputs stay whole.** UF-09.6's detail renders `itemSummary(item)` and the
    `formatKg` weight as two sibling elements, with an `aria-hidden` "·" between them. Neither
    string is joined, parsed or extended (D-0114 §5).
12. **Placeholder pins are updated, not dropped.** When a child replaces a placeholder view, it
    changes T-0304a AC-7's per-state "exactly 1 button" assertion for that state to the new view's
    exact count (for example UF-09.3: Pause + Done set = 2). It lists the change in its build log.
    The other assertions in that test stay as they are. This doesn't weaken the test: it encodes
    the real view.

## Consequences
- The orchestrator edits the board:
  - Split the T-0304b row into T-0304b and T-0304f, T-0304c into T-0304c and T-0304g, and T-0304d
    into T-0304d and T-0304h, with the deps in §1.
  - T-0306b keeps its dep on T-0304d, which still holds UF-09.9 and its seam positions. T-0305a/b
    keep the parent T-0304, which is done when all eight children are.
- T-0304b lists `apps/web/src/lib/format/number.ts` and its test as extras (§6). No other in-flight
  ticket lists that file. T-0391 only imports `formatKg`.
- No contract changes. Sets go through `lib/offline` exactly as D-0015 and D-0045 §6 define.

## Revisit when
- A kill between the IndexedDB commit of `recordSet` and the store's `SET_RECORDED` write
  (milliseconds) is seen to duplicate a set in real use. Then reconcile on restore against the
  queue's sets for the session.
- Users edit on UF-09.4 so often that the 5 s auto-save feels hurried, or more than 30 % of
  auto-saves are followed by a List-view edit (D-0026 trigger).
- A lb unit setting or a second UI language arrives (D-0114 §4, D-0115 Revisit).
