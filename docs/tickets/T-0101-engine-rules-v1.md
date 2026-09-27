---
id: T-0101
title: Engine rules v1 (gap B4): warm-up, energy, swap ranking, progression/pre-fill, shuffle, main lift, "planned session"
lane: engine
screens: [UF-08.1, UF-08.2, UF-08.3, UF-05.1, UF-09.3, UF-09.4, UF-09.8, UF-10.1, UF-10.2, UF-11.1, UF-11.2]
decisions: [D-0004, D-0013, D-0015, D-0018, D-0024, D-0025, D-0026, D-0027]
deps: [T-0001]
status: ready
---
## Why
`docs/engine-rules.md` v0 left out warm-up generation, energy modifiers, swap ranking, shuffle, progression and pre-fill, the main lift, and what a "planned session" is (gap B4, PRD open question). It also used v1 screen IDs in rules 8 and 9, and had rules no test could encode ("~40 % of the window's days remain"). T-0200, T-0201 and T-0202 cannot build a deterministic engine (principle 3) until every rule can be tested with fixed inputs. This ticket writes v1 of the contract and folds in the board follow-ups from T-0001: D-0018 → rule 9, D-0013 → rule 3, tombstones (D-0015) → rule 3, the balance() output per `docs/specs/uf-10-balance.md`, and the v2 IDs UF-09.8 and UF-11.

## Scope
- In:
  - `docs/engine-rules.md` v1: rules 0–14, a shared fixture set (F-tz, F-profile, F-targets, F-input, library L1), worked examples `Rn-Em` for every rule, required tests, and traceability to T-0200/T-0201/T-0202.
  - Decisions D-0024 (session building, energy, time check), D-0025 (swap ranking, shuffle), D-0026 (progression, pre-fill) and D-0027 (targets rhythm factor, attention, recovery clock, balance shape, check-in reset). All are `revisit`.
  - Edge cases as examples: zero history (R3-E4, R5-E4, R7-E2), returning after 10 days off (R5-E1, R14-E3, R11-E3), time running out (R8-E1…E3), offline-merged history (R0-E2, R11-E4), 15- and 90-minute budgets (R7-E2, R7-E8).
  - The PRD open-question row for gap B4 moves to Resolved.
- Out:
  - Engine code and tests (T-0200/T-0201/T-0202).
  - Schema and API changes (proposed as follow-ups to data/content).
  - Goal- and level-based targets and reps, RIR-based progression, recency weighting, routine-specific progression rules (UF-07), and "Always use this in <routine>" (UF-08.3).

## Acceptance criteria
This is a contract/docs ticket. Each AC is a mechanical check (Grep or a file-exists check) that `scripts/check-docs.mjs` can run (T-0004). The build tickets turn each `Rn-Em` into a unit test.
- AC1 Given `docs/engine-rules.md`, When searched for headings `^## (\d+)\.`, Then rules 0–14 each appear exactly once, and each rule section contains ≥ 1 example matching `\*\*R<n>-E\d+`.
- AC2 Given `docs/engine-rules.md`, When searched for `pending decision`, `~` (approximate numbers), `UF-06.2` or `(UF-09)` as a rule-9 reference, Then there are 0 matches. Rule 8's heading cites `UF-09.8` and rule 9's heading cites `UF-11`.
- AC3 Given rule 3, Then it names the local calendar window D−13…D, `completed_at` as the only placement date, and the exclusion of `deleted_at` rows, and it cites D-0013 and D-0015.
- AC4 Given rule 9, Then it defines period, completed session, planned session, the under (< 0.7 × 2·min) and over (> 1.1 × 2·max) thresholds, the 1–7 clamp, and the reset, and it cites D-0018. R9-E1…E11 map one-to-one to UF-11 spec ACs.
- AC5 Given rule 11, Then it lists every field from `docs/specs/uf-10-balance.md` §"Data the screens need": area, load, target, deficit, coverageStep, needsAttention, recovering, lastTrainedDate, days[14], contributors[exerciseId, weightedSets, lastDate], windowStart, windowEnd and computedAt.
- AC6 Given `.squad/decisions/`, Then D-0024, D-0025, D-0026 and D-0027 exist with `status: revisit`, and each one is cited in `docs/engine-rules.md`.
- AC7 Given every example R7-E2, R7-E4, R8-E1, R8-E2, R14-E4 and R11-E2, When recomputed by hand from the fixtures, Then the stated outputs match. The review verifies the arithmetic, and T-0201/T-0200 tests will fail if it doesn't.
- AC8 Given `docs/PRD.md`, Then the gap-B4 row is under "Resolved questions" and cites D-0024…D-0027.

## Paths you may change
`docs/tickets/T-0101-*.md`, `docs/PRD.md` (product lane), `docs/engine-rules.md` (contract, named by D-0024…D-0027), `.squad/decisions/D-0024…D-0027`.

## Contract impact
`docs/engine-rules.md`: rewritten to v1 by D-0024, D-0025, D-0026 and D-0027. It encodes D-0013, D-0015 and D-0018 as already decided.

## Definition of done
Every AC check passes · `pnpm -w typecheck lint test` green (there is no code change) · the contract change is linked to decisions · commit messages start with `T-0101` and cite screen IDs.
