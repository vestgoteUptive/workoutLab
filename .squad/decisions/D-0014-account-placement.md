---
id: D-0014
title: UF-01.5 Account comes after the plan preview; the 60 s is measured from UF-01.1 to UF-01.4
status: decided
date: 2026-09-27
by: product-owner (T-0001)
area: product
---
## Context
D-0002 puts sign-up inside onboarding as UF-01.5. Principle 5 requires a first plan in under 60 s. A magic-link round trip through email is outside our control and can take longer than the whole budget. Gap D defaults to no guest mode.

## Decision
- Order: UF-01.1 Welcome → .2 Goal → .3 Level & equipment → .4 Schedule & plan → **.5 Account** ("Save your plan": magic link or Google). Returning users choose "I have an account" on UF-01.1, which goes straight to UF-01.5.
- The plan on UF-01.4 is computed on the device (the engine runs in the browser) and held locally until sign-in completes. It is then written to the user's profile and targets.
- There is still no guest mode. Nothing past UF-01.5 (Today, workouts, history) can be used without an account.
- **Metric:** time-to-first-plan runs from the first render of UF-01.1 to the first render of UF-01.4 with a plan. Target p50 ≤ 45 s, p90 ≤ 60 s in the first user test.
- If the tab closes before the account is created, the answers are kept in local storage for 24 h.

## Consequences
T-0301 builds this order. The e2e test in T-0403 times UF-01.1 → UF-01.4.

## Revisit when
The first user test, especially if drop-off at UF-01.5 exceeds 30 %.

## Confirmed
Confirmed by the human 2026-09-29 (D-0061). It reopens only through its own "Revisit when" trigger.
