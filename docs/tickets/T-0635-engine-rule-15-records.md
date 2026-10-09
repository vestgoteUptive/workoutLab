---
id: T-0635
title: "Engine rule 15 records(history, library) (D-0219): per-session best set (weight then reps; duration for timed) that strictly beats every earlier other-session set; engine-rules.md §15 with R15-E1…E12, the export, unit + simulated-history tests"
lane: engine
screens: [UF-02.1]
decisions: [D-0219, D-0217, D-0068, D-0015, D-0034]
deps: []
status: todo
---
<!-- Written by product-owner 2026-10-09 (spec, D-0217 §1, D-0219). Flow: wl-build-engine (agent engine-dev). About ½ day. Spec: docs/specs/cobalt-mock-behaviour.md §3.2. Display-only: no existing engine output changes. -->

## Why
"Latest PR" on Today (D-0217) needs a definition of a personal record. D-0068 §5 says record logic belongs in the engine with worked examples, not in the UI. D-0219 defines it; this ticket writes the rule into the contract and implements it.

## Scope
- **In:**
  - `docs/engine-rules.md`: a new `## 15. Records (UF-02.1, D-0219)` with D-0219 §1 as the rule text and R15-E1…E12 as worked examples; a line in "Required tests" and a §Traceability row (T-0635).
  - `packages/engine/src/records.ts`: `records(history, library): RecordSet[]` and the `RecordSet` type, exported from `src/index.ts`. Uses the existing `normalizeHistory` and `isHardSet`.
  - Tests: `test/rule-15-records.test.ts` (one case per example) and `test/rule-15-records-histories.test.ts` (the simulated 14-day history fixture, R15-E12).
- **Out:** any caller (T-0636); UF-06's `bestSet` (unchanged); estimated 1RM (H-36).

## Acceptance criteria
- **AC1 (E1–E3: beat, more reps, equal).** R15-E1 returns exactly one record (S2's 102.5 × 6, `previous` 100 × 8); R15-E2 returns S2's 100 × 9; R15-E3 returns `[]`.
- **AC2 (E4: first session).** Rising sets in a single session return `[]`.
- **AC3 (E5, E6: tombstone and warm-up).** A tombstoned best set is skipped and the session's next best (100 × 9) is the record; a warm-up 120 × 1 is ignored on the baseline side, so 102.5 × 6 is still a record.
- **AC4 (E7–E9: kinds).** Timed 60 s → 75 s is a record (key `durationS`); bodyweight 20 → 25 reps is a record; 10 kg × 5 beats 0 × 12 (weight first).
- **AC5 (E10: gap).** S1 100 × 8, S2 95 × 8, then 10 days later S3 102.5 × 5 → only S3 is a record, with `previous` 100 × 8.
- **AC6 (one per session and exercise).** A session with 102.5 × 6 and 105 × 3 after a 100 × 8 baseline returns one record for that session (105 × 3); ties inside a session go to the earlier `completedAt`, then the smaller `clientId`.
- **AC7 (unknown and warm-up exercises).** Sets of an exercise not in `library`, or of a `kind = "warmup"` move, never appear in the output or the baseline.
- **AC8 (E11: determinism).** Shuffled input and a duplicated replayed row (same `clientId`, older `editedAt`) give a deep-equal output; the purity lint test passes for `records.ts`.
- **AC9 (E12: simulated history).** On the shared 14-day history fixture (`test/fixtures/histories.ts`), the output is a fixed list asserted in full (exercise, session, set and previous).
- **AC10 (order and shape).** The output is sorted by `completedAt`, then `clientId`, and every element has the `RecordSet` fields of D-0219 §1 (type-checked and asserted on one element).
- **AC11 (no other change).** Every existing engine test and snapshot passes unchanged; `suggest`, `balance`, `timeCheck`, `rankSwaps` and the rule 14 pre-fill don't import `records.ts` (an import-graph assertion).

Checklist (D-0197 §7):
- Record and no record, first and later session, weighted, bodyweight and timed, live and tombstoned, and hard and warm-up sets are all covered.
- Tombstoned (`deletedAt`) rows are in the fixtures (AC3).

## Paths you may change
- `packages/engine/**` (lane)
- `docs/engine-rules.md` (lane contract, named by D-0219)
- `docs/tickets/T-0635-engine-rule-15-records.md` (log only)

## Contract impact
`docs/engine-rules.md`: new rule 15 (records). Named by D-0219.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green (forced: contract change) · simulated 14-day history test green · commit messages start with `T-0635` and cite UF-02.1.

## Build / accept log
