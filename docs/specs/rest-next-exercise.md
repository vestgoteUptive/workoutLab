# Rest screen names what is next (UF-09.5) — spec

- **Idea:** the owner, 2026-11-24: the rest screen shows only "Rest", the timer, −15 s / +15 s, "Next · set 3 of 4", "27,5 kg × 20" and "Skip rest". It never says which exercise. They want at least the exercise name, and when the next set starts a new exercise, a short cue or the first how-to line, so they can get ready while resting.
- **Screens:** UF-09.5 Rest. Related: UF-09.3 Current set (the same per-side wording), UF-09.6 Next exercise (the cue shows there too, right after).
- **Decisions:** D-0273 (this idea's defaults). Builds on D-0066 §7 (rest rules), D-0118 §7 §8 (the "Next" line, cue and name sources), D-0208 (Cobalt rest state), D-0212, D-0261, D-0263, D-0267 (per-side wording), T-0979 (the first-frame flag store).
- **Principles:** 1 (one task on screen): Rest stays the task. The added text is two read-only lines inside the existing "Next" block: no new button, link, illustration or step. 2, 3, 4, 5: untouched. The cue is library text, never LLM text (principle 3).
- **Contracts:** none change (no tokens, no data model, no openapi, no engine rule).

## Problem
Rest is the one moment in a workout with nothing to do, and it is the moment to get ready. Today the "Next" block says set 3 of 4 and a weight, but not which exercise. After the last set of an exercise it shows "Next · {name}" in the small caption size and nothing else, so the user sees UF-09.6 (the cue, with a 60 s set-up clock) only after the rest ends.

## Findings from the code (so the ticket is not guessed)
- A rest follows every saved set except the last set of the last exercise (`restFollowsSet`, machine.ts). So **a rest after the last set of an exercise is real**: `setAfterRest` is null and the "Next" line already shows the next item's name (`nextItem`, rest.tsx), at caption size. UF-09.6 then follows.
- **Per-side wording does not apply on this screen today.** rest.tsx builds "27,5 kg × 20" with `en.uf09.load` and `en.uf09.reps` and never reads the flag. A flagged exercise (dumbbell row) reads "× 10" on rest and "× 10 per arm" one second later on UF-09.3. The UF-09.3/09.4 screen spec says "the rest state shows no flagged label"; D-0273 reverses that.
- The cue is on `ExerciseDetail.cue` (cached in IndexedDB, read with no refresh, D-0111 §11) through `useCachedFields` in `use-cue.ts`, which also holds the first-frame flag (T-0979). All 108 library rows have a cue, at most 45 characters. The name is `ctx.library`, already loaded, so it is on the first frame.
- There is no design spec file for UF-09.5 (only the prototype and the Cobalt README), so one is created.

## Behaviour
The "Next" block (under −15 s / +15 s, above Skip rest) is a column of up to four lines, in this order:

| # | Line | Style | When |
|---|---|---|---|
| 1 | Caption | label role | always when something follows |
| 2 | Exercise name | 1.5rem (24 px), weight 700, `--wl-ink`, wraps, never truncated | always when something follows |
| 3a | Load line | stat role (as today) | next set of the same exercise, reps set |
| 3b | Cue | body role, `--wl-ink` | next set starts a new exercise |

- Hierarchy: the timer stays the largest thing (hero number); the load stays the largest line in the block; the name is the second line you read; the caption and cue are quiet. The name never competes with the timer.
- Same exercise: the name is the exercise of the next set, the same one the user just did.
- No cue line for a same-exercise rest (the cue was on UF-09.3 a moment ago).
- Colours: `--wl-ink` only. On rest `--wl-ink-muted` has no key of its own and resolves to the same white; white on rest `bg` is 4.9:1 and on the red it drains to 4.8:1, both over 4.5:1.
- The block has no `role` and no `aria-live`: it is read in order with the screen. The only live things on rest stay the timer and the chrome announcer.
- 320 px and 200 % zoom: every line wraps; no `text-overflow`, no `line-clamp`, no fixed height. The page scrolls (`min-height: 100dvh`) and Skip rest stays reachable by scrolling and keeps focus on mount, as today.
- Cue source: the cached `cue`; when it is missing or empty, the first line of the cached how-to (`instructions[0]`); when neither exists, no line. A rejected or missing cache read gives no line and no error.

## Copy
| Where | Text |
|---|---|
| Caption, same exercise | "Next · set 3 of 4" (as today); "Next · back-off set" for a back-off |
| Caption, new exercise | "Next exercise" (the UF-09.6 caption string, `en.uf09.titles.next`); replaces "Next · {name}" |
| Name | the library name, e.g. "Dumbbell row" |
| Load, not flagged | "27,5 kg × 20" (as today) |
| Load, flagged | "27,5 kg × 10" and, wrapped under the number, " per arm" in the `.wl-uf09__unit` span (the UF-09.3 pattern) |
| Load, flagged, screen-reader text | "27,5 kg, 10 reps per arm" in a visually hidden span; the visible lines `aria-hidden` |
| Bodyweight, not flagged / flagged | "20 reps" / "10 reps" + " per arm" |
| Weight unknown (zero history) | "Set weight" over the reps, as today, with the same suffix when flagged |
| Cue | the library cue, e.g. "Lead with the elbows, stop at shoulder height" |

The suffix words come only from `apps/web/src/lib/i18n/per-side.ts` (`perSide`, `readReps`, D-0263 §8). The rest screen keeps no copy of them.

## States
| State | What the Next block shows |
|---|---|
| **Same exercise next** | Caption "Next · set 3 of 4", name "Bench press", load "27,5 kg × 20". No cue. |
| **New exercise next** (the last set of an exercise just ended, another follows) | Caption "Next exercise", name "Dumbbell row", cue "Lead with the elbows, stop at shoulder height". No load line, no sets summary (UF-09.6 shows that next). |
| **Last set, nothing next** | There is no rest after the last set of the last exercise (D-0066 §7), so this screen does not appear. If a rest still exists with nothing after it (a rest started from the List view), the Next block is absent: Rest, timer, ±15 s, Skip rest, exactly as today. No name, no cue, no empty caption. |
| **One-side exercise** | Same exercise next: the load line reads "× 10 per arm" (or leg or side) with the hidden reading. New exercise next: the name and cue only; there are no reps on the screen to label. Both read the flag from the first-frame store, so the suffix is there on the first paint (T-0979). Not flagged: exactly as above without the suffix. |
| **Timed exercise** | Same exercise next: caption and name, no load line (as today; the hold target shows on UF-09.7 after "Get in position"). New timed exercise next: name and cue. No stepper, no "Hold 0:40" here. |
| **Offline** | Identical. Name from the session's library (already loaded). Cue and flag from the cached `ExerciseDetail` and the in-memory flag store. A detail that is not cached: name and load show, no cue line, no suffix (reads as both sides), no message, no error. |
| **10 days off** | Nothing changes. The load line shows whatever the engine's re-entry pre-fill gave; the name and cue are the same. |
| **Zero history** | Weight unknown, so the load area reads "Set weight" over the reps (as today); the name still sits above it. A first-ever rest after set 1 shows the name from the library, no history needed. |
| **At 0 (GO)** | "GO" shows as today; the Next block stays until the machine moves on. |

## First frame
- **On the first paint:** caption, name, load and the per-side word (name from `ctx.library`, word from the T-0979 store through `useCachedFields`).
- **After the first paint:** the cue (its own IndexedDB read, as on UF-09.3 and UF-09.6). It is the last line of the block and the screen's other items are pinned above and below it, so nothing already visible moves when it arrives. A second mount of the same exercise has it on the first return only if the cue is also in the store; that is out of scope (see below).

## Out of scope
- Sets × reps summary, illustration, mistakes, how-to link or a "see more" on rest (each would be a second task).
- Anything about the exercise after next, the plan, or the list view.
- Putting the cue into the T-0979 first-frame store (a web-shell change); parked unless the cue shifting is seen in use.
- Cue on a same-exercise rest.
- Timed hold target on rest.
- Changing UF-09.6, its cue or its set-up clock; changing rest lengths, the ±15 s buttons or the cues at 10 s and 0.
- Voice or sound reading of the next exercise.
- Engine, data model, API, tokens (none change).

## Open questions for the owner (defaults in D-0273, work proceeds)
1. The name is 24 px bold, smaller than the weight line. Larger names would push Skip rest below the fold on a 320 px phone.
2. A new-exercise rest shows the cue (up to 45 characters), not the first how-to step (a full sentence). The step is only the fallback.
