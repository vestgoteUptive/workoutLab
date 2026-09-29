---
id: D-0079
title: UF-04 Library and UF-06 Progress build defaults: filters in the URL, fixed area order, partial-cache states, warm-up ids, ExerciseHowTo reads the cache only, Monday-first current-month calendar, one set-format rule
status: revisit
date: 2026-09-29
by: product-owner (T-0306a, T-0307b groom)
area: product
---
## Context
D-0069 (UF-04) and D-0068 §5–§6 (UF-06) set the v1 scope. Grooming T-0306a and T-0307b into testable ACs turned up ten points that neither decision settles, and that a builder would otherwise settle silently:
- where the browse filters live,
- which order the area pills use,
- what a screen shows when the cache is only partly filled,
- whether a warm-up move gets a page,
- what `ExerciseHowTo` may touch while it is open inside a workout,
- which calendar layout and which count to show,
- how a set is written.

The partial-cache case is real, not hypothetical. T-0319's Dexie v2 tables start empty and fill on the next `refreshAll()`. A device that upgraded while offline therefore has `libraryCache` rows but no `exerciseDetails` rows.

## Decision
1. **Browse filters live in the URL.** UF-04.1 keeps its state in search params inside the existing `/library` route (D-0071 §2): `q` (the raw search text), `area` (one of the 9 areas, or absent for All) and `mine=1` (My equipment). Updates use `replace`, not `push`, so Back leaves the list and doesn't step through keystrokes. Coming Back from UF-04.2 restores the filters. An `area` value that isn't one of the 9 areas is treated as All.
2. **Area pills and columns use the fixed area order.** Primary areas come from the engine's `primaryAreas` (rule 1: weight 1.0, fixed order). Secondary areas are the weight-0.5 areas in the same fixed order. So back squat reads **Glutes, Quads** | **Core, Hamstrings**. T-0306's parent ACs wrote "Quads, Glutes". That was prose order, and the engine order wins (principle 3: don't re-order what the engine defines).
3. **Partial cache states, never a redirect:**
   - **Empty library cache** (never online on this device): UF-04.1 shows "The exercise library downloads the first time you're online." and no "No exercises match" text.
   - **Library row present, detail missing:** UF-04.2 still renders the header, tag line and muscles from `loadLibrary()`. In place of the how-to it shows "Instructions download the next time you're online." It hides Variations and attribution.
   - Only an id that isn't in `loadLibrary()` redirects.
4. **Warm-up moves get no library or progress page.** `/library/<warm-up id>` redirects to `/library`, and `/progress/<warm-up id>` redirects to `/progress`, consistent with D-0069 §1 hiding them from browse. `ExerciseHowTo` accepts any library id, including warm-ups, because it is the in-workout how-to.
5. **Equipment and licence labels.**
   - `[]` or `["none"]` reads "Bodyweight". The other 9 vocabulary items (`data/exercises/schema.json`) get labels in `flows/uf-04.ts`. An unknown value prints as its raw id, with no crash.
   - The licence link map has one entry, `CC-BY-SA-4.0` → `https://creativecommons.org/licenses/by-sa/4.0/`. Any other licence string on a non-workoutLab row is printed as text, with no link.
   - External links open with `target="_blank"` and `rel="noopener noreferrer"`.
   - The labels are duplicated later by UF-01.3/UF-05 unless they move to a shared module. That's a follow-up, not a blocker.
6. **`ExerciseHowTo` reads the cache only.**
   - Props are `{exerciseId: string; onClose(): void}`. The caller mounts it to open it.
   - It never calls `refreshAll`, supabase-js or `fetch`, because it renders inside UF-09 and must work with no network (principle 1, NFR-OFF-1).
   - Focus moves into the dialog on mount. On close it returns to the element that was focused at mount, if that element is still in the document. Otherwise focus is not forced.
7. **UF-06.1 calendar:**
   - It shows the **current local month only**, Monday-first (ISO weeks), with blank cells outside the month. There is no month navigation in v1. On the 1st the calendar is new, and Recent exercises still shows the last 56 days.
   - "{n} workouts this month" counts **sessions** that rule 9 calls completed (`hardSetCount ≥ 1`), including one that hasn't ended. Days are marked by the local date of `startedAt`. Two sessions on one day mark one day and count 2. The copy for n = 1 is "1 workout this month".
8. **One set-format rule (UF-06.1, UF-06.2).** The exercise's kind picks the format:
   - library `timed` → timed;
   - else, any hard set in scope with `weightKg > 0` → weighted;
   - else → reps.

   | Kind | In a session row | As a "Best set" label |
   |---|---|---|
   | weighted | `102.5 × 5` | `102.5 kg × 5` |
   | reps | `15` | `15 reps` |
   | timed | `45 s` | `45 s` |

   Weights use `Intl.NumberFormat` with at most 2 fraction digits and no grouping. "Heaviest" reads `{w} kg`, or "—" when no set has `weightKg > 0`.
9. **UF-06.2 rows.**
   - There is one row per `sessionId` among the exercise's hard sets in the 56-day window.
   - A row is dated by the local date of its first hard set (by `completedAt`), and its sets are listed in `completedAt` order.
   - Rows are sorted newest first by that first `completedAt`. Ties go to the smaller `sessionId`.
   - **Recent exercises** (UF-06.1) takes an exercise's "latest session" as the one holding its greatest `completedAt`, with ties going to the smaller `sessionId` (D-0068 §4, D-0040 §9).
10. **Dates in tests use `en-GB`.** Screens format with Intl in the device locale. Tests pass `locale: "en-GB"`, the `OfflineStatus` default, so strings like `Fri 25 Sep` and `September 2026` are exact.

## Consequences
- T-0306a encodes §1–§6, and T-0307b encodes §7–§10.
- Follow-up (web-shell): move the equipment labels to a shared `lib/i18n` module once a second flow (UF-01.3, UF-05) needs them.
- Phase 5 idea: month navigation on UF-06.1, once more than 56 days are cached.

## Revisit when
- Design delivers a UF-06.1 calendar or a UF-04.1 filter spec.
- A user test finds that counting an unfinished session as a workout misleads.
- Warm-up moves get their own content and a page.
