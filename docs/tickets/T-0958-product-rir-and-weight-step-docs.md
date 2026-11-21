---
id: T-0958
title: User flows and PRD, add the "Weight step" row and note that RIR is now used
lane: product
screens: [UF-04.2, UF-09.4]
decisions: [D-0250, D-0251, D-0253, D-0259, D-0026, D-0002]
deps: []
status: done
---
## Why
D-0026 said "RIR is logged but not used in v1". D-0250 amends that, and UF-04.2 gains a row. The product docs must say so, or readers see a rule that no longer holds.

## Scope
- In:
  - `Design-docs/docs/product/user-flows.md`: UF-04.2 gains the "Weight step" row (loaded, non-timed exercises; editable offline; never in UF-09, UF-01 or UF-08); UF-09.4 note that RIR now gates the weight increase, with the `hold_effort` reason.
  - `docs/PRD.md`: a row for RIR progression and own weight steps linking D-0250 to D-0253 and D-0259; the "RIR not used" note (via the D-0026 row at line ~66) amended to point to D-0250.
  - Check no other doc under the product paths still says RIR is unused.
- Out: code, contracts, screen design (T-0955).

## Acceptance criteria
- AC1 Given user flows v2, When read, Then UF-04.2 lists the Weight step row with its range (0.25 to 10 kg, multiples of 0.25), default (library value) and offline behaviour.
- AC2 Given user flows v2, When read, Then UF-09.4 states RIR 0 or 1 at the top reps holds the weight once, RIR >= 2 (or no RIR) raises it, with no other change in focus mode.
- AC3 Given the PRD, When read, Then the D-0026 mention says RIR is used from D-0250, and a new row cites D-0250, D-0251, D-0252, D-0253, D-0259.
- AC4 Given `node .github/scripts/check-all.mjs`, When run, Then it reports no screen-ID, v1-label, grant-format or duplicate-decision errors in these files.

## Paths you may change
- `Design-docs/docs/product/user-flows.md`
- `docs/PRD.md`

## Contract impact
none

## Definition of done
`node .github/scripts/check-all.mjs` clean · commit messages start with `T-0958` and cite UF-04.2 and UF-09.4.

## Build / accept log
- Base HEAD ff83af05; docs only, no code or contract change.
- AC1: `user-flows.md` UF-04.2 "Weight step" bullet (range 0.25 to 10 kg in multiples of 0.25, default library value, editable offline).
- AC2: `user-flows.md` "Reps in reserve now count" paragraph under the UF-09 table (RIR 0/1 holds once with `hold_effort`, RIR >= 2 or none raises, no other focus-mode change).
- AC3: `PRD.md` D-0026 row amended to point to D-0250; new scope row cites D-0250 to D-0253 and D-0259.
- Other docs: only `docs/specs/estimated-1rm.md` says "RIR is not used", about the 1RM estimate (still true, not a product-path doc); no other change needed.
- AC4: `check-all.mjs` reports no screen-ID, v1-label, grant-format or duplicate-decision error; its only output is `lane-path-not-owned` for other tickets' files already on the branch diff against main (not touched here).
