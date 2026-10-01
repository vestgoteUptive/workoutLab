---
id: D-0097
title: UF-01 sub-screens render their own screen ids; the web-shell test rows that used UF-01.1 as the `/welcome/*` marker are updated by the UF-01 ticket that builds each sub-path
status: revisit
date: 2026-10-01
by: product-owner (groom T-0301b)
area: process
builds-on: D-0063 §2, D-0064, D-0075, D-0088
---
## Context
T-0300a's stub renders `[data-screen-id="UF-01.1"]` for every path under `/welcome/*`. Web-shell tests
(T-0300b, T-0301a) use that id as the "the `/welcome/*` splat rendered, with no redirect" marker on
sub-paths:
- `apps/web/src/app/auth-guard.test.tsx`: "signed out: /welcome/goal renders without a redirect".
- `apps/web/src/app/__tests__/profile-gate.test.tsx`: AC-7 (the `missing` stand-down rows, the
  no-bounce `Recorder` rows, the in-place `SIGNED_IN` rows and their `present` contrast), AC-9
  (`/welcome/goal` signed out), AC-11 (`/welcome/save`), the `/account` `missing` row, the D-0073 §3
  `stale` row, and AC-10's synchronous `getByText("Welcome")` (the stub `<h1>`).

D-0063 §2 says each sub-screen renders its own `data-screen-id`. Once T-0301b builds UF-01.2 at
`/welcome/goal`, those rows fail although the routing they guard is unchanged. D-0088 rules on the
same shape for three Phase 3 shell tests, but `auth-guard.test.tsx` isn't one of them, and D-0088
names only Phase 3 routes.

## Decision
1. **Screen ids under `/welcome/*`.** `/welcome` renders UF-01.1, `/welcome/goal` UF-01.2,
   `/welcome/level` UF-01.3, `/welcome/schedule` UF-01.4. `/welcome/save` keeps rendering UF-01.1
   until T-0301c builds it. Any other sub-path renders UF-01.1 and doesn't redirect. The `routes.ts`
   entry `/welcome/*` keeps `screenId: "UF-01.1"` (the flow's entry screen).
2. **D-0088 applies to the UF-01 rows.** In `auth-guard.test.tsx` and `profile-gate.test.tsx`, a row
   or case that asserts UF-01.1 on a `/welcome/<sub>` path exists only because the splat was a stub.
   The UF-01 ticket that builds that sub-path updates the expected id to the built screen's id, and
   nothing else in the row. The guarantee stays: same path, same auth/profile state, same location
   assertions (no redirect, no bounce through `/`).
3. **AC-10's text query** may point at the built UF-01.1 heading instead of the stub "Welcome". It
   stays a synchronous first-render assertion. T-0331 still owns its order-dependence.
4. **Grants.** T-0301b: the `/welcome/goal` rows and the AC-10 query. T-0301c: the `/welcome/save`
   rows. T-0301d needs none, because no web-shell test visits `/welcome/level` or `/welcome/schedule`.
   Other rows stay byte-identical. Review checks this.

## Consequences
- T-0301b and T-0301c each list the two files as extras in `## Paths you may change`.
- T-0301b, T-0301c, T-0366 and T-0331 all touch `profile-gate.test.tsx`. Don't run any two of them
  in parallel.
- `tests/e2e/auth.spec.ts` asserts UF-01.1 only on `/welcome` and `/`, so it is unaffected.

## Revisit when
- T-0301c has merged. At that point no stub-era UF-01 row is left, and this grant expires.
