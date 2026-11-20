---
id: T-0964
title: Update user flows and PRD for the estimated 1RM on Exercise history
lane: product
screens: [UF-06.2]
decisions: [D-0257, D-0258, D-0068, D-0219]
deps: []
status: ready
---
## Why
D-0257 amends D-0068 (UF-06 scope) and D-0219 (rule 15, "never the e1RM number"). The user flows and PRD must say that UF-06.2 shows an estimate and Today still never does.

## Scope
- In: `Design-docs/docs/product/user-flows.md` (UF-06.2 gains the "Est. 1RM about N kg" card, chart and table line; UF-02.1 notes "Latest PR" stays the actual set; UF-08 and UF-09 never show it); `docs/PRD.md` (one line under history/progress); amendment notes for D-0068 and D-0219; mark the mock rows: row 10 (UF-03.3 summary estimate) stays deferred, row 16 (UF-06.2 estimate) now in.
- Out: code, engine rules, tokens, decision files (process lane owns `.squad/decisions/**`; D-0257 already records the amendment).

## Acceptance criteria
Each criterion becomes at least one automated test (the repo checks `node .github/scripts/check-all.mjs`, plus a text assertion in that check or a grep-based repo test where one exists).
- AC1 Given `user-flows.md`, When read at UF-06.2, Then it names the Est. 1RM card, delta line, chart and "Show as table" toggle, and the five states (zero history, none valid, bodyweight or timed, one point, two or more).
- AC2 Given `user-flows.md` at UF-02.1, UF-08 and UF-09, Then each says the estimate never appears there (Today's "Latest PR" is the actual set, principle 1).
- AC3 Given `docs/PRD.md`, Then it mentions the estimated 1RM as display-only, computed by the deterministic engine (principle 3), on UF-06.2 only.
- AC4 Given the mock-row list, Then row 10 is marked deferred and row 16 is marked in.
- AC5 Given the check script, When `node .github/scripts/check-all.mjs` runs, Then it reports no screen-ID, v1-label or duplicate-decision findings from these files.

Checklist (D-0197 §7): no binary-condition or migration ACs apply (docs only).

## Paths you may change
- `docs/PRD.md`
- `Design-docs/docs/product/**`
- `docs/specs/**` (only the estimated-1rm spec, if a wording fix is needed)

## Contract impact
none.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green · contracts unchanged · commit messages start with `T-0964` and cite UF-06.2.
