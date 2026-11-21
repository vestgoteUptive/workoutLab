---
id: T-0976
title: Add the "do all reps on one arm, then switch" line to the exercise how-to
lane: web-feature:UF-04
screens: [UF-04.2]
decisions: [D-0260, D-0261, D-0263]
deps: [T-0972, T-0973, T-0954]
status: done
---
## Why
The how-to is where the user learns the rule: reps for one side, one set covers both, log RIR for the weaker side (D-0263 §7). One static line under the steps, only for flagged rows. Lands after T-0954 which edits the same screen.

## Scope
- In: one static body-text `<p>` under the steps on UF-04.2 for flagged rows, text per the T-0973 spec; arm, leg or side as the row says; timed variant without the RIR sentence.
- Out: any change for bilateral rows, UF-09, engine, new tokens.

## Acceptance criteria
- AC1 Given dumbbell-row on UF-04.2, When shown, Then the extra line reads "Do all reps on one arm, then switch. Log reps for one arm. One set covers both arms. Log RIR for your weaker side."
- AC2 Given single-leg-calf-raise, Then the same line says "leg"; Given cable-woodchop, Then "side".
- AC3 Given side-plank (timed), Then the line reads "Hold one side, then switch. Log seconds for one side." with no RIR sentence.
- AC4 Given barbell-row, Then there is no extra line and the screen is unchanged.
- AC5 Given the network off with the library cached, Then the line shows for a flagged row; Given a cached row without `unilateral`, Then no line shows.
- AC6 Given UF-04.2 with a flagged row, When axe runs, Then it passes; text uses body-text colour from existing tokens.

Checklist (D-0197 §7): AC5 covers offline and old-cache; AC1 and AC4 cover flagged and not flagged.

## Paths you may change
Lane `web-feature:UF-04`: `apps/web/src/features/uf-04/**` (exercise detail screen, strings, tests). Extra: strings go through the shared module from T-0974 only if it fits; otherwise keep the line in UF-04 strings and say so in the log.

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged or decision linked · commit messages start with `T-0976` and cite screen IDs.

Per-package commands: one command per script.

## Build / accept log

### Build (frontend-dev)
- Base 96dce8d3 (clean). Line is a static `<p data-field="one-side" class="wl-type-body">` rendered in `LibraryDetail` right after `<HowToBody>` (UF-04.2 only; the UF-09 how-to sheet shares HowToBody and is untouched). Shown when `detail.unilateral` is non-null; timed variant when `exercise.timed`.
- Strings: kept in `apps/web/src/features/UF-04/one-side.ts` (not the shared T-0974 `per-side` module, which does not exist yet; and `lib/i18n/flows/uf-04.ts` is outside this lane per check:repo `lane-path-not-owned`). Follow-up: move into the shared module once T-0974 lands.
- AC map (`__tests__/one-side-howto.test.tsx`, 6 tests): AC1 arm text + `<p>` directly after steps; AC2 leg and side; AC3 timed text, no RIR; AC4 barbell-row no line; AC5 offline (network off) shows line and a cache entry stripped of `unilateral` shows none; AC6 axe clean (color-contrast and region rules off in jsdom), body class, no role/aria-live. Fixture `l1plus.ts` gained a `unilateral` column.
- Planted faults (backup copy, restored by cp, verified with cmp): never-render, 5 fail; timed branch removed, AC3 fails; always-render, AC4 and AC5 old-cache fail.
- Gate: web turbo typecheck lint test --force green (4/4); format:check ok; test:repo-checks rc=0; UF-04 e2e 37 passed.
- check:repo: only `supabase/**` lane-path findings remain, from `main` having moved past this branch base (those files are not in my diff); none for UF-04.
