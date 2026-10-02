---
id: D-0143
title: "T-0235 updates the T-0221 pinned D-0132 strings and the rule 14 property oracle to the D-0137 drop, and nothing else in them"
status: revisit
date: 2026-10-02
by: engine-dev (build T-0235)
area: engine
builds-on: D-0137 §1, §4, D-0132 §1
---
## Context
T-0235 implements D-0137: rule 14 steps 2 and 5 become `min(W, max(inc, floorInc(0.9 W)))`.
Two existing tests encode the superseded D-0057 §4 formula outside a plain literal:
1. `packages/engine/test/fixtures/rule14-pinned-d0132.ts` `RULE14_D0132` pins steps 2 and 5 and
   the Drop floor bullet byte for byte. T-0221's "byte-identical to the D-0132 text" test compares
   rule 14 against it, so the D-0137 §4 doc edits fail it. The fixture's own comment says a change
   to those lines "needs a new decision"; D-0137 §4 is that decision and names exactly these lines.
2. `packages/engine/test/rule-14-properties.test.ts` holds an independent rule 14 oracle whose
   `drop` is the uncapped `max(inc, floorInc(0.9 W))`. Seed 32 (leg-curl at W 2, inc 5) then
   expects 5 where D-0137 §1 gives 2.

T-0235 AC7 says every T-0221 test passes unedited, and AC8 allows only "a literal that expects a
drop heavier than W" to change.

## Decision
1. The T-0221 test file is unedited. In `RULE14_D0132` only `step2`, `step5` and `bullets[2]`
   (Drop floor) change, to the exact D-0137 §4 text now in `docs/engine-rules.md`, with a comment
   citing D-0137. `RULE14_PINNED` (heading, Last performance, steps 1/3/6/7, timed, R14-E1…E9) is
   untouched, and every T-0221 token check still holds.
2. The rule 14 oracle's `drop` gains the `min(cur.w, …)` cap with a D-0137 comment. It is the
   oracle's encoding of the same formula the ticket's AC8 literal clause covers. No other oracle
   line, seed or count changes.

## Consequences
- engine: the T-0221 byte pin and the seeded oracle now pin the D-0137 drop. A later change to
  steps 2 or 5 still needs a decision.
- No other test expectation changed (T-0235 build log).

## Revisit when
- A reviewer reads AC7/AC8 strictly as forbidding fixture or oracle edits. The alternative is a
  T-0221 follow-up ticket that moves the D-0132 pin to the D-0137 text.
