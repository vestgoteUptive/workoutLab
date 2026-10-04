---
id: T-0374
title: "T-0219 AC6 wording: say what was accepted (no plank at F-input, forced core via the non-core exclude list, planned-cost free-up, R7-E8 sweep) — docs only"
lane: product
screens: [UF-08.2]
decisions: [D-0092]
deps: [T-0219]
status: ready
groomed: 2026-10-04
---
<!-- Written by product-owner 2026-10-04 (groom mode). Build flow: product-owner (docs only). About 15 minutes. No code or test changes. -->

## Why
T-0219 AC6 (`docs/tickets/T-0219-timed-cost-at-prefill-duration.md`, line 85 at `a191d11`) says:
"If no shuffle at F-input puts plank in a slot, the test says so and uses
`excludeIds: ["dead-bug", "hanging-knee-raise"]` to force core onto plank." That exclude list
never opens a core slot: rule 7.2 does not reach core at AC1's input, so the build forced core by
excluding every exercise **outside** chest and core instead. It also added two cases the AC never
named: shuffling a timed item **out** frees only its planned cost (35 s and 120 s plank), and the
R7-E8 budget sweep with the forced core slot. The build was accepted on those tests
(`packages/engine/test/t0219-timed-cost.test.ts`, the "rule 13 shuffle fits a timed pick at its
planned duration (D-0092 §2)" describe block). The ticket text should describe what was
accepted, so the next engine ticket that copies AC6 does not copy an exclude list that cannot
work.

## Scope
- In: replace the AC6 bullet in `docs/tickets/T-0219-timed-cost-at-prefill-duration.md` with the
  wording below (one bullet with sub-bullets), and nothing else in that file.

  ```
  - **AC6 (rule 13 shuffle fit)** Each shuffled timed slot is accepted only when its
    planned-duration cost fits (D-0092 §2). Every case asserts Σ `costS` ≤ `available` and AC8's
    identity for each timed item.
    - At F-input (AC1's history, `pinnedIds []`), no `shuffle` in 0…6 puts plank in a slot (rule
      7.2 never reaches core there), and every plan fits.
    - Core is forced with `excludeIds` = every library exercise except bench-press, dead-bug,
      hanging-knee-raise and plank. (`["dead-bug", "hanging-knee-raise"]` does not open a core
      slot.) At 20 min a shuffle onto plank × 3 at 120 s does not fit and dead-bug stays; at
      22 min it fits exactly for shuffles 2 and 5 (plank × 3, 120 s, `costS` 600, `unusedS` 0).
    - Shuffling a timed item out frees only its planned cost: a planned-35 s plank (345 s) is
      not replaced by a 375 s pick at 18 min; a planned-120 s plank × 2 (420 s) is, and High
      energy then adds the bench-press back-off at 20 and 21 min.
    - R7-E8 sweep with the forced core slot: four histories × `budgetMin` 15…30 step 1 and
      35…120 step 5 × warm-up on/off × `shuffle` 0…6 × energy never goes over (5712 runs).
  ```
- Out:
  - Any other AC, the front matter (`status` stays as it is) or the archived log of T-0219.
  - `packages/engine/**` (the tests already exist; engine lane).

## Acceptance criteria
- **AC1 (wording matches the tests)** Given the edited T-0219, Then its AC6 names: no plank at
  F-input; the "every exercise except bench-press, dead-bug, hanging-knee-raise and plank"
  exclude list; the planned-cost free-up for both the 35 s and the 120 s plank; and the R7-E8
  sweep ranges. Each named value appears in the matching `it` of
  `packages/engine/test/t0219-timed-cost.test.ts` (lines 368-557 at `a191d11`); cite each `it`
  title against its sub-bullet in the log.
- **AC2 (the bad exclude list is gone as an instruction)** `grep -n 'excludeIds: \["dead-bug", "hanging-knee-raise"\]'`
  on the T-0219 file prints nothing; the list appears only inside the "does not open a core
  slot" note, without the `excludeIds:` prefix.
- **AC3 (nothing else moved)** `git diff --stat` lists only the T-0219 file and this ticket file;
  in T-0219 only the AC6 bullet's lines change.
- **AC4 (checks)** `node .github/scripts/check-all.mjs` exits 0.

## Paths you may change
- `docs/tickets/T-0219-timed-cost-at-prefill-duration.md` (AC6 bullet only; lane `product`)
- `docs/tickets/T-0374-t0219-ac6-wording.md` (log only)

T-0490 does not touch T-0219, so the two can run in parallel.

## Contract impact
none

## Definition of done
AC1-AC4 hold and are recorded in the log · `node .github/scripts/check-all.mjs` green · contracts
unchanged · commit message starts `T-0374` and cites UF-08.2.

## Build / accept log
- Replaced T-0219's AC6 bullet exactly as scoped. AC1: each named value traced to its `it` in
  `packages/engine/test/t0219-timed-cost.test.ts` — no-plank-at-F-input → "rule-13 (AC6) AC1's
  history, no pins: no shuffle 0…6 puts plank in a slot"; the exclude list and 20/22 min cases →
  "a shuffle onto plank at 120 s that doesn't fit leaves the original (20 min)" and "at 22 min the
  shuffle onto plank fits exactly"; the free-up cases and R7-E8 sweep per the test file's
  remaining `it`s in that describe block (confirmed `CORE_ONLY` = library minus bench-press,
  dead-bug, hanging-knee-raise, plank, matching the ticket's wording exactly).
- AC2: `grep -c 'excludeIds: \["dead-bug", "hanging-knee-raise"\]' docs/tickets/T-0219-*.md` → 0.
- AC3: `git diff --stat` lists only `T-0219-timed-cost-at-prefill-duration.md` (14 insertions, 1
  deletion — the AC6 bullet only).
- AC4: `node .github/scripts/check-all.mjs` — pending final run before commit.
- Status: done.
