---
id: D-0130
title: Rule 12 states rankSwaps as (… now, tz), matching the code and D-0056 §2; the T-0204 and T-0224 rule 12 guards accept that one line
status: revisit
date: 2026-10-02
by: product-owner (groom, T-0212)
area: engine
builds-on: D-0056 §2, D-0092 §6, D-0096 §2
---
## Context
D-0056 §2 fixed the `rankSwaps` signature as `(currentExerciseId, reason, session, profile, library, history, now, tz)`, the same `now, tz` order as every other engine function. The code in `packages/engine/src/swaps.ts` follows it. It called the rules text's `tz, now` a typo and left the fix to a follow-up.

The board row for that follow-up says "rule 0". But rule 0 lists the function only as `rankSwaps(…)`, with no arguments. The `tz, now` order appears in one place: the first line of rule 12 (`## 12. Swap ranking`).

That line sits inside the slice the T-0204 guard compares with `main` (`t0204-traceability.test.ts`, rule 12 up to and including the R12-E5 line, plus rule 13; re-scoped by D-0092 §6). The T-0224 guard (`rule-12-apply-swap.test.ts`, "R12-E1…R12-E5 and rule 13 are unchanged against main") compares the same slice. On the ticket branch, both guards would fail while `main` still has the old line.

## Decision
1. **Contract edit (engine lane).** In `docs/engine-rules.md` rule 12, the signature
   `rankSwaps(current, reason | null, session, profile, library, history, tz, now)`
   becomes
   `rankSwaps(current, reason | null, session, profile, library, history, now, tz)`.
   No other character of rule 12 changes. Rule 0's `rankSwaps(…)` stays as it is. No behaviour changes.
2. **The two guards accept exactly this line.** The T-0204 guard and the T-0224 guard keep comparing their slice with `main`. Before comparing, they also accept the slice with this one line reverted, the same way the T-0204 guard already accepts the D-0056 §1 R12-E1 line. The before and after lines live in one new fixture, `packages/engine/test/fixtures/rule12-signature-d0130.ts`. So the guards pass on the branch (where `main` has the old line) and after merge (where `main` has the new line). Any other change in the slice still fails them. Nothing they guard becomes unguarded.
3. **Doc and code agree.** A committed test reads the parameter names of `rankSwaps` in `src/swaps.ts` with the TypeScript compiler API. It checks them against the rule 12 signature, with `current` ≡ `currentExerciseId`. The order must match exactly.

## Consequences
- engine (T-0212): makes the §1 edit and the §2 guard change, and adds the §3 test and a Traceability row.
- D-0056's revisit trigger "Rule 0's `rankSwaps(… tz, now)` argument order is corrected" is discharged by this decision. D-0056 itself stays `revisit` for its other triggers.
- No vendor regen: `src/**` is unchanged.

## Revisit when
- `rankSwaps` gains or loses a parameter (for example `excludeIds`, D-0059's trigger). The §3 test then fails until rule 12's signature is updated under that change's own decision.
