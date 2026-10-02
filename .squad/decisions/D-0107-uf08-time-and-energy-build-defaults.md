---
id: D-0107
title: UF-08.1 build defaults (T-0303a): step URLs and cold loads, a UF-08.2 placeholder until T-0303b, one suggest call per distinct input, a once-read clock, fit-line copy, the finish-time input, loading and offline states
status: revisit
date: 2026-10-02
by: product-owner (groom T-0302a/T-0303a)
area: product
builds-on: D-0063 §2-§3, D-0065 §2-§3, D-0071 §2 §8, D-0095
---
## Context
D-0065 §2-§3 and D-0071 §2 fix the UF-08.1 values: 45 min, ±5 within 15-120, chips 20/30/45/60/90, the finish time converted once, the fit line, and `?step=` views where a cold load shows UF-08.1. A builder still has to guess at nine smaller things. Each guess changes what a test asserts:
- which URL is canonical;
- what `?step=suggested` renders before T-0303b exists;
- when `suggest` runs;
- whether "done by" keeps ticking;
- singular and plural copy;
- whether the fit line says "+ warm-up" when the warm-up isn't in the budget;
- what the time input does with partial values;
- what the screen does before the cache loads;
- which offline indicator UF-08 uses.

## Decision
1. **URLs.** `/session/setup` and `/session/setup?step=time` both render UF-08.1. A cold load of any other `step` value (`suggested`, `swap`, `ready` or anything unknown) does `navigate("/session/setup", {replace: true})` and renders UF-08.1. No stale step stays in history (principle 2). Setup state (minutes, warm-up, energy, the current `Workout`) lives in the `SessionSetup` host's memory. Moving between steps is a push navigation inside the same route, so the host doesn't remount.
2. **UF-08.2 placeholder.** Until T-0303b lands, `?step=suggested` reached from "Suggest my workout" renders `<section data-screen-id="UF-08.2">` with an `<h1>` "Your workout" and a Back link to `?step=time`. T-0303b replaces its body. The placeholder takes the host's `Workout` as a prop, so the hand-off is testable now (reference-equal).
3. **Exactly one `suggest` call per distinct input.** The host computes the `Workout` from `(data, budgetMin, warmupInBudget, energy)`, memoised on those values. The memo keys on the data's **content**, not its array identity. A cache re-read (after `refreshAll` resolves, or when the 3 s cap fires) returns new arrays. If their content is deep-equal to the previous read, there is no new call. A user change that leaves the inputs unchanged also makes no call: re-pressing the active chip, `−` at 15 or `+` at 120. A re-read with changed content counts as a new input and makes exactly one call. `profile` is the cached `EngineProfile`, `goal` included (D-0095), so the rep slots follow the user's goal.
4. **The clock is read once.** `now` is read when the host mounts (an injectable `now` prop, defaulting to `new Date()`). "Done by", the finish-time conversion and `suggest` all use that one value. The page doesn't tick in v1.

   `locale` and `timeZone` are injectable props too:
   - `timeZone` defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone` and is the `tz` given to `suggest` and `refreshAll`.
   - `locale` defaults to `"en-GB"`, reading `navigator.language` only behind a type guard.
   - Neither default touches `navigator.languages`, because shell tests stub `navigator` as `{onLine}`.
5. **Copy.**
   - The fit line is "Fits: {n} {exercise|exercises}, {m} {set|sets} + warm-up", where m = Σ `sets` + the number of items with a back-off (D-0065 §3). Singular when the value is 1.
   - The " + warm-up" suffix shows whether or not the warm-up counts in the budget. The warm-up still happens either way (D-0065 §6).
   - n = 0 → "Nothing fits in {budget} min".
   - The fit line is `aria-live="polite"`.
6. **Finish time.**
   - "Set a finish time" shows an `<input type="time">` labelled "Finish by". The input is empty.
   - A value is converted only when it's a complete `HH:MM`.
   - A valid conversion closes the input and sets the stepper. "Done by" then shows `now + budgetMin` (13:07 → 67 min → "done by 13:07"; clamped 23:59 → 120 → "done by 14:00").
   - A rejected value keeps the input open, shows "Pick a time later today", and leaves the minutes unchanged.
7. **Loading.** The UF-08.1 wrapper and every control render on the first commit. Before the first `Workout` exists, the fit line reads "Checking what fits…" and "Suggest my workout" is `aria-disabled="true"`, so a tap does nothing. Loader rejections are caught: the screen then shows the no-profile state, never an uncaught error.
8. **Offline indicator.** `<OfflineStatus variant="icon">`, the UF-08/UF-09 no-chrome variant (D-0045 §3, §9).
9. **No profile or fewer than 9 targets.** The screen shows "Connect to finish setting up your plan" with a link to `/`, and `suggest` isn't called. The time controls stay hidden: with no engine result there is nothing to fit.

## Consequences
- T-0303a encodes §1-§9 as ACs. T-0303b replaces the §2 placeholder body. It keeps `data-screen-id="UF-08.2"` and the `Workout` prop.
- T-0303d's "done by" on UF-08.4 uses its own `now + m` (D-0065 §6). It doesn't reuse UF-08.1's.

## Revisit when
- Users leave UF-08.1 open long enough for "done by" to go stale. Then tick once a minute.
- Users ask to remember their last budget (D-0065 revisit).
