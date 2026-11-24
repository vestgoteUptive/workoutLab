---
id: T-0991
title: e2e the rest screen's next exercise name, cue and per-side word (320 px, 200 % zoom, offline)
lane: qa
screens: [UF-09.5, UF-09.3, UF-09.6]
decisions: [D-0273, D-0261, D-0263]
deps: [T-0990]
status: ready
---
## Why
The web ticket proves the logic in jsdom. Wrapping, "no truncation" at 320 px and 200 % zoom, the first-frame word and the offline cue need a real browser (spec `docs/specs/rest-next-exercise.md`, D-0273).

## Scope
- In: one new spec `tests/e2e/uf-09-rest-next.spec.ts`, built like `uf-09-one-side.spec.ts` (seeded sessions in IndexedDB, Supabase mocked through `page.route`, its `withFlagged` rows `dumbbell-row` (arm) and `side-plank` (side), `barbell-row` as the unflagged control, `settledBox`).
- Out: app code, UF-09.6, engine pins.

## Acceptance criteria
- AC1 Given a plan of `barbell-row` (3 sets) then `dumbbell-row`, When the user saves set 1 of `barbell-row`, Then the rest shows "Next · set 2 of 3", "Barbell row" and the load line with no "per arm". When the last set of `barbell-row` is saved, Then the rest shows "Next exercise", "Dumbbell row" and its cue; on Skip rest UF-09.6 shows the same cue.
- AC2 Given `dumbbell-row` set 1 saved, Then the rest load line reads "× 10 per arm" and a `MutationObserver` installed with `page.addInitScript` records no state of that line without "per arm" from document start (`--repeat-each 10` green). Sibling: `barbell-row` never shows it. A hard reload into the rest is recorded in the log (informational).
- AC3 Given the viewport 320 × 568, When the rest after `dumbbell-row` shows its longest-library-name case, Then the name's `scrollWidth` equals its `clientWidth` (no truncation), the page has no horizontal scroll, and Skip rest can be scrolled into view and clicked. Given 200 % zoom (viewport 160 × 284 and root font size 200 %), Then the same three checks hold.
- AC4 Given the browser offline (`goOffline`) with the session and cached details present, Then AC1's two rests still show the name, the cue and the suffix. Sibling: online, AC1. Given a detail missing from the cache, Then the name shows and there is no cue line and no console error.
- AC5 Given zero history (no previous sets for `barbell-row`), Then the rest shows the name above "Set weight". Given a return after 10 days off built through UF-08 so the engine prices it, Then the rest shows the name and the re-entry load.
- AC6 Given the rest screen with the block, Then axe reports no violations, every button is at least 44 px (`settledBox`), the timer stays the largest text on the screen, and the Next block has no `aria-live`.
- AC7 Given the existing `uf-09-*` and `uf-03-*` specs, Then they stay green; onboarding under 60 s is unaffected (not touched, no assertion added).

Checklist (D-0197 §7): flagged and not (AC2), same and new exercise (AC1), online and offline (AC4), cue present and absent (AC1, AC4), 320 px and 200 % zoom (AC3); no migration here.

## Paths you may change
Lane `qa`: `tests/e2e/**` (the new spec only).

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · `npx playwright test tests/e2e/uf-09-rest-next.spec.ts` green, run through `scripts/locked.sh heavy` · contracts unchanged · commit messages start with `T-0991` and cite screen IDs.

## Build / accept log
- Build (QA, T-0991): new `tests/e2e/uf-09-rest-next.spec.ts` (19 tests + 4 `test.fail` known-defect markers). AC1 first test; AC2 first/sibling tests (+ hard reload informational: reads "12 kg × 10 per arm"); AC3 320 and 200 % tests; AC4 three offline tests; AC5 two; AC6 two; AC7 uf-09-focus green. Run: spec + uf-09-focus `--repeat-each 3` 147 passed. Faults (cp-restored, cmp-checked, not committed): F1 `flagged = false` in rest.tsx red in 5 tests (AC2, AC3 same-flagged x2, AC4 flagged, AC5 10-days); F2 cue forced null red in 4 (AC1, AC3 new-exercise x2, AC4); F3 name `nowrap/ellipsis` in uf-09.css red in 4 (AC3). Measured at 320x568 (long name, 45-char cue): Next block 133 px, Skip rest top 532 px, page scrolls 65 px; flagged same-exercise: block 196 px, Skip top 595 px, scrolls 128 px; Skip rest scrolls into view and clicks. At 160x284 with root font 200 %: name 120x331, block 826/1033 px, Skip reachable. DEFECT: at 160 px (with or without 200 % root font) the page scrolls sideways (186 > 160; 351 with 200 % font): the rest timer is wider than its box, and at 200 % font also the -15 s/+15 s row and Skip rest's arrow. Not the Next block. Page-level checks are `test.fail` markers.
