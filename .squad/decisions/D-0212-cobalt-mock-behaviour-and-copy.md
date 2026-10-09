---
id: D-0212
title: "Cobalt mock behaviour and copy: build the UF-02.1 week row and week line, UF-09 state captions (\"Lifting · set n of N\" and others), UF-09 wording (Done, Save · start rest, paused caption, value-first stats), UF-09 status lines (Target hit, done line, Set-up time, First up) and the \"Exercises\" tab; 21 other canvas differences stay out (deferred or rejected)"
status: revisit
date: 2026-10-09
by: owner (2026-10-09: include the mock's new behaviour and copy); spec defaults by product-owner (groom)
area: product
amends: D-0208
builds-on: D-0030, D-0034, D-0056, D-0065, D-0066, D-0107, D-0192, D-0210
---
## Context
D-0208 §6 says the redesign leaves behaviour, copy and flows unchanged. On 2026-10-09 the owner asked to include the new behaviour and copy the mock shows, as specced work in separate tickets from the restyles.

Draft H-33 named the known items: the Today week row, a "Lifting" label on the set screen, and the wording differences (tab "Exercises" vs "Library", "Done" vs "Done set", the paused wording and the suggest wording). A frame-by-frame read of rounds 3–5 found more. Most of the canvas copy is sample data.

The full inventory, exact copy, rules and edge cases are in `docs/specs/cobalt-mock-behaviour.md`.

## Decision
1. **Built** (spec §1). Each item is its own ticket, in its own lane, after the restyle of the same folder:

   | Item | Ticket | Lane |
   |---|---|---|
   | UF-02.1 week row (Mon–Sun, done, rest and upcoming days, today underlined) and the week line "Sunday — 3 of 3–5 done this week", from the local cache and queue | T-0623 | UF-02 |
   | UF-09 state captions: "Warm-up · move n of N", "Lifting · set n of N" (also "Lifting · back-off set"), "Next exercise", "Timed set · n of N". This is the colour-blind fallback the README requires. | T-0619 | UF-09 |
   | UF-09 wording: "Done", "Save · start rest" (only when a rest follows), the paused caption "Workout paused · timers stopped", value-first paused stats | T-0620 | UF-09 |
   | UF-09 status lines: "Target hit." (reps ≥ `repsMax`), "{name} done · n sets" on UF-09.6, the "Set-up time" label, "First up" on UF-09.1 | T-0621 | UF-09 |
   | "Exercises" for the tab and the UF-04.1 title (route and screen IDs unchanged) | T-0622 | web-shell |

2. **Ordering exception.** The UF-09 state captions (T-0619) run **before** the UF-09 restyle, not after it. Lift and rest differ by hue only, so a red or teal UF-09 screen must never ship without its state named in text (D-0208 §5). The other §1 tickets follow their folder's restyle.
3. **Suggest wording.** No change: the app already says "Suggest my workout". The routine-named fit line needs a routine name that engine suggestions don't have (spec §1.6).
4. **Not built** (spec §2).
   - Rejected, because each conflicts with a principle, a contract or a decision:
     - weekly set counts (14-day window);
     - the swap reason chips (API enum, D-0056);
     - a 3-point effort (D-0030);
     - a user-chosen progression rule (engine rule 14);
     - a "Lose fat" goal (data model);
     - a name greeting (no name stored);
     - "[App name]" (a placeholder);
     - exercise illustrations (D-0192).
   - Deferred as Phase 5 ideas, which the owner may promote (H-34): plate loading, Latest PR on Today, the quick-start link, routine-named heroes, routine writes from a swap, time-check option deltas, summary volume and 1RM, library filters and tags, a cue table, streaks and records, a 1RM chart, and new onboarding inputs.
5. **Copy lives in the flow files.** Each feature ticket edits only its own `lib/i18n/flows/uf-NN.ts` (D-0071 §1). T-0622 edits `en.ts` (web-shell). A restyle ticket never edits a string.

## Consequences
- The copy tickets change accessible names: "Done set" → "Done", and "Library" → "Exercises" for the tab link and the UF-04.1 heading. They update the tests that query those names, and their logs list each one. No other ticket in this phase changes a name.
- User flows v2 is updated by T-0618 (product): the week row in UF-02.1, the captions in UF-09, and "Done" on UF-09.3.

## Revisit when
- The owner promotes a deferred item (H-34).
- Users find "Done" ambiguous next to the autosave line.
- The week line's "of 3–5" reads oddly to users and should become the rhythm minimum only.
