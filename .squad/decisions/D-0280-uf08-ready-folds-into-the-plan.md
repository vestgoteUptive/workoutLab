---
id: D-0280
title: "UF-08.4 Ready folds into UF-08.2: Start is one tap on the plan screen (1 tap with no edit, 3 with two), the finish time stays on the plan, the focus-mode explainer and switches move into a collapsed disclosure, UF-08.4 is retired and its ID is never reused"
status: revisit
date: 2026-11-24
by: product-owner (owner answer), triage (superseded wording)
area: product
amends: D-0065, D-0110, D-0274, D-0276, D-0279
builds-on: D-0002, D-0107, D-0123, D-0170, D-0195
---
## Context
The owner answered the open question of D-0274 §10 and the areas-first spec (question 2): **fold the Ready step into the plan screen.** Start happens directly from UF-08.2: 1 tap with no edits, 3 with two edits. Principle 2 still holds: the UF-08.1 time question stays and stays first.

What UF-08.4 shows today, checked against `Ready.tsx`, D-0065 §6 to §7 and D-0110 (the request described it as "the warm-up choice, the time check and the first item", which is not what the screen does):
1. A **summary line**: "{m} min · warm-up + {n} exercises · {s} sets · done by {HH:MM}" (m from the plan's own length, D-0110 §1 and §2).
2. A **four-step explainer** "How focus mode works" (principle 1 taught once before Start).
3. **Three device switches**: Sound cues, Voice countdown 3-2-1, Keep screen awake (`wl-focus-prefs`, D-0110 §6).
4. **Start**, which writes the `sessions` row through the offline queue and replaces the URL with `/session/<id>` (D-0110 §3 to §5, D-0123).

The warm-up choice is UF-08.1's "warm-up counts in the budget" switch and UF-09.1's "Skip warm-up". The time check is UF-09.8. The first item is shown on UF-09.1. None of those moves.

## Decision
1. **Start is on UF-08.2.** The primary button is **"Start workout"** and replaces "Looks good" (still the only `--wl-action` fill). Everything Start did on UF-08.4 moves with it, unchanged: `clock()` is read at the tap for `started_at` (D-0110 §1); one session id per visit to the plan step, made on the first tap, reused by a retry, dropped when the step unmounts (D-0110 §3); a rejected write shows "Couldn't start the workout. Try again." (`role="alert"`) and re-enables the button; Start makes no network call, online or offline (D-0110 §5); the jump is one REPLACE to `/session/<id>` (D-0110 §4, D-0123 §2), which opens UF-09.1; the plan written is the `orderItems`-ed plan as shown. While the write is pending the plan controls and the Back link are inert (`aria-disabled`, T-0397), so the written plan is the shown plan.
2. **Disabled at no areas, on every entry.** "Start workout" is `aria-disabled` with "Add at least one area." in `aria-describedby` when the plan has no area. This replaces D-0274 §6's "Looks good is disabled" for Start empty and also covers an empty default plan ("Nothing fits"), which UF-08.4 let start as "Nothing planned". A workout of only a warm-up cannot be started from setup any more.
3. **What UF-08.4 showed, one by one:**
   - **Summary line: disappears.** Its minutes are the time bar line on UF-08.2 ("About {m} of {n} min"); the exercise and set counts are the rows' own numbers. Its **finish time moves up**: the line under the title is **"Done by {HH:MM}"** (now + the plan's minutes, `ceil(totalS / 60)`, as UF-08.4 computed it, re-derived after every edit, `clock()` read at mount). It replaces D-0274 §1's "{n} min · done by {HH:MM}" (the budget minutes are in the bar line and the time chips). With no areas the line reads "{n} min to fill".
   - **Explainer and the three switches: move into one disclosure "Focus mode"** at the bottom of UF-08.2, above Start: a native `details`, **collapsed on every visit**, holding the unchanged four-step list and the unchanged three switches with the same storage and defaults (D-0110 §6). Opening it is not an edit and not a tap of the budget. `focus-prefs.ts` and the `index.prefs.ts` leaf that UF-09 reads (D-0170) do not change.
   - **Start: §1.**
4. **The screen ID.** **UF-08.4 is retired, not a redirect.** There is no screen, no `data-screen-id="UF-08.4"` and no route behaviour to keep: `?step=ready` is an unknown step, which the host already replaces with `/session/setup` (D-0107 §1; the host holds the `Workout` in memory, so no URL could reach a Ready state from a cold load anyway). The ID **stays in the flow index, marked retired, and is never reused or renumbered**, because tickets, specs and decisions cite it and the screen-ID check would fail on every one of them. This amends D-0276 §1 (the flow-index row) and keeps D-0002: user flows v2 stays the only source of IDs.
5. **Tap budget (the owner's target).** From UF-08.2 shown to Start tapped: **0 edits = 1 tap, 2 edits = 3 taps**, where an edit is one tap on − / + / Remove / "Add {Area}". From UF-02.1 with no edit: **3 taps** (Start workout, Suggest my workout, Start workout); "Quick 20-min" is 3 as well. Each further edit adds one. An area detail visit (UF-08.6) is counted as its own taps and is not in the two-edit budget. Before: 2, 4 and 4.
6. **Principles.** (1) Nothing is added to UF-09; the disclosure is before Start and collapsed. (2) UF-08.1 still asks for the minutes before every workout and its buttons are unchanged; the minutes stay on UF-08.2 in the bar line and the time chips. (5) Untouched.
7. **The cost, said plainly.** Ready was a pause before a session row exists, and an accidental tap is now one tap from a started workout. The safety nets stay: UF-09.1 is a 5-second get-ready countdown, Pause is on every UF-09 screen and End workout is behind it (UF-09.9), and a second or abandoned unfinished session is accepted and goes stale after 12 h (D-0123 §4, D-0111 §7). First-timers no longer see the explainer unless they open the disclosure: UF-09's always-visible pause button answers "everything else is behind pause".
8. **Order of work (amends D-0279 §1 and §2).** A new ticket **T-1009** (`web-feature:UF-08`) does the fold after T-0997 and before T-0998. Until it lands, T-0996 and T-0997 keep "Looks good" opening the built UF-08.4, so the area plan can ship first. The deploy hold of D-0279 §3 is unchanged (T-0996 and T-0997). T-0992, T-0993, T-0996, T-0998 and T-0999 are amended.

## Consequences
- Spec `docs/specs/areas-first-planning.md` is updated in this commit (flow, tap budget, UF-08.2 layout, states, copy, the what-happens-to-what-exists table, question 2 answered).
- User flows v2: the index row marks `.4 Ready (retired, D-0280)` now; T-0992 rewrites the prose.
- `docs/specs/non-functional.md` NFR-OFF-2 and NFR-TIME-3 and `docs/gaps.md` name UF-08.2 for Start and the switches.
- Tests that go through Ready (about 14 e2e specs and the UF-08 `ready-*` unit tests) change deliberately in T-1009, each with a one-line reason; none is weakened. `docs/specs/uf-08-add-and-reorder.md` and `docs/specs/empty-start-plan.md` keep UF-08.4 as history.

## Revisit when
- People start workouts by mistake (a confirm, or a short undo after Start, would be the answer).
- First-timers miss how focus mode works (then open the disclosure on a user's first workout).
- The finish time on UF-08.2 confuses people next to the bar line.
