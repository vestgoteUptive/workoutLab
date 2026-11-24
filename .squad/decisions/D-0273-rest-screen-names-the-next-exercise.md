---
id: D-0273
title: "UF-09.5 Rest names what is next: the exercise name on every rest, the cue when a new exercise follows, and the per-side word on the load line; reads 'next set only' as 'nothing beyond the next step'"
status: revisit
date: 2026-11-24
by: triage (check mode, idea flow)
area: product
amends: D-0261, D-0263
---
## Context
Owner request 2026-11-24 (spec `docs/specs/rest-next-exercise.md`): the rest screen never names the exercise, and when the next set starts a new exercise the user would like a short cue or the first how-to line to get ready while resting.

Conflict check against what exists:
- **User flows v2, UF-09.5 row:** "Countdown on the rest-to-lift drain, next set only (D-0208)". A name and a cue could look like more than "next set only". Read in context (the same table says UF-09.6 owns the next exercise's name, picture, sets and cue), the rule keeps the plan, the list and later items off the screen. The name of the exercise the next set belongs to is part of that set. Once the last set of an exercise is done, the next step is the next exercise, and rest.tsx already shows its name there ("Next · {name}", D-0118 §7). So the idea extends a line that exists; it does not add a task.
- **Principle 1 and "Every screen: pause, progress bar, index. No other chrome" (UF-09):** the new lines are text inside the existing "Next" block, with no control, link, image or step. Pause, Skip rest, −15 s and +15 s are unchanged. No conflict.
- **Timer hierarchy (Cobalt README, D-0208):** the hero number stays 9.375rem (clamped on narrow screens) and the load stays at the stat size. The name is smaller than both. No conflict.
- **Per-side wording (D-0261, D-0263 §4, D-0267):** the screen spec for UF-09.3/09.4 says the rest state shows no flagged label, and rest.tsx builds the load line without the flag. That is a gap, not a decision: D-0261 lists UF-09.3 and UF-09.4 and never mentions UF-09.5, so a flagged exercise reads "× 10" on rest and "× 10 per arm" on UF-09.3. A "per arm" bug on the screen between two labelled screens defeats D-0261's purpose (a logged 10 is never read as 20).
- **First frame (T-0979):** applies to the flag on this screen. The cue keeps its own async read (T-0979 left it out of scope).
- **Contracts:** `tokens.json`, `docs/data-model.md`, `api/openapi.yaml` and `docs/engine-rules.md` are untouched. Data-modeler and engine-dev impact review: confirmed no change (the name is in `ctx.library`; `cue`, `instructions` and `unilateral` are already on the cached `ExerciseDetail`; the engine picks nothing new, principle 3).
- No other decision or open triage item conflicts. D-0066 §7 (rest lengths, "no rest after the last set of the last item") and D-0118 §10 (announcer) are unchanged.

## Decision
1. **Name on every rest that leads somewhere.** The "Next" block gains a name line directly under the caption: the exercise of the next set (same exercise) or of the next item (new exercise). It is plain text, 1.5rem, weight 700, `--wl-ink`, wraps, never truncated. No new token, role or font.
2. **New exercise next:** the caption becomes "Next exercise" (the existing `en.uf09.titles.next`), replacing "Next · {name}", and a cue line follows the name. The cue is the cached `ExerciseDetail.cue`; when it is missing or empty, `instructions[0]`; when neither exists, no line. No sets-and-reps summary, picture, mistakes or link (UF-09.6 has them one step later).
3. **Same exercise next:** caption, name, load line. No cue line.
4. **Per-side on the load line.** A flagged exercise's load line reads "27,5 kg × 10" with " per arm" (`perSide`) in the `.wl-uf09__unit` span, and a hidden reading "27,5 kg, 10 reps per arm" (`readReps`), as on UF-09.3. Bodyweight and "Set weight" variants take the same suffix. Words only from `lib/i18n/per-side.ts`. This extends D-0261 and D-0263 §4 to UF-09.5 and replaces the UF-09.3/09.4 spec line that says the rest state shows no flagged label.
5. **Timed next set:** name only, as the load line is today (no hold target on rest). A new timed exercise shows name and cue.
6. **Nothing next:** no Next block at all (no name, no cue, no empty caption).
7. **First frame:** name and per-side word on the first paint (library in context; flag through `useCachedFields`, which reads the T-0979 store). The cue arrives after the first paint, as the last line of the block, and moves nothing already visible. Putting the cue into the flag store is not done.
8. **Offline and cache misses:** identical; a missing or rejected detail read gives no cue and no suffix, with no message.
9. **Not a live region.** No `role`, no `aria-live`; the timer and the chrome announcer stay the only live things.
10. **Spec and flow docs.** A new `Design-docs/docs/design/screens/UF-09.5.md` (T-0989) fixes layout, type and contrast; `UF-09.3-UF-09.4.md` loses its rest line; the UF-09.5 row in `Design-docs/docs/product/user-flows.md` is reworded (done with this decision) from "next set only" to "the next set, or after an exercise the next exercise's name and cue".

## Consequences
- web-feature:UF-09 changes `rest.tsx`, `uf-09.css`, `lib/i18n/flows/uf-09.ts` (drops `nextItem`, keeps the rest), and the tests that pin "Next · {name}" (a deliberate update, each with a one-line reason).
- The "Next" block is taller. At 320 px and 200 % zoom the page scrolls (`min-height: 100dvh`); Skip rest keeps focus on mount and stays reachable.
- A user who had the name only after the rest now sees it, and the cue, during it. The same cue then shows again on UF-09.6; that repeat is intended (pre-read, then act).
- Follow-up tickets: T-0989 (design), T-0990 (web), T-0991 (e2e).

## Revisit when
The owner finds the 24 px name too small or too large on a real phone, wants the first how-to step instead of the cue, wants the cue on a same-exercise rest, or the cue is seen shifting on arrival (then add it to the first-frame store, a web-shell ticket).
