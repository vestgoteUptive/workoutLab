---
id: T-0387
title: Decide whether lib/i18n/workout.ts formatters take a locale before UF-08.2 / UF-09 depend on them
lane: product
screens: [UF-02.1, UF-08.2, UF-09]
decisions: [D-0114, D-0106, D-0017, D-0045, D-0075]
deps: [T-0302c]
status: ready
---
## Why
T-0302c review: the six `workout.ts` formatters are 1-arg, put raw integers into strings and pluralise in English only. T-0303b (UF-08.2) and UF-09 are about to call them, so the signature question had to be settled before they did.

## Scope
- In: a decision on the signatures, the rule for keys added later, the shape of a future locale change, and the T-0302c builder defaults.
- Out: any code change to `workout.ts`, and the kg formatter (a follow-up, D-0114 Consequences).

## Acceptance criteria
- AC1 Given D-0114, When T-0303b and the UF-09 tickets are built, Then they call the six formatters with exactly one argument and follow its §5 caller rules. Review checks this; the existing value-pinned T-0302c tests stay unchanged and green.
- AC2 Given D-0114, When a later ticket introduces a locale, Then it adds an optional trailing `locale?: string` whose absence leaves today's output byte for byte (§4).
- AC3 Given the T-0302c accept log, When a reader looks for its builder defaults, Then D-0114 §6 records all three of them.

## Paths you may change
`.squad/decisions/D-0114-*.md`, this ticket.

## Contract impact
none

## Definition of done
D-0114 written. No code changes, so `pnpm -w typecheck lint test` is unaffected.
