---
id: D-0097
title: UF-01 sub-screens render their own screen ids; the web-shell test rows that used UF-01.1 as the `/welcome/*` marker are updated by the UF-01 ticket that builds each sub-path
status: revisit
date: 2026-10-01
by: product-owner (groom T-0301b)
area: process
builds-on: D-0071 §2, D-0064, D-0075, D-0088
---
> **Amended by D-0100 (2026-10-01).** §1: `/welcome/save` renders `UF-01.5-save` once T-0301c builds it. T-0301c's grant (§4) also covers the AC-5, `/account`, `stale` and AC-11 rows, whose target is `/welcome/save`, and the AC-6 "not redirected" markers (T-0301c AC-13).

## Context
T-0300a's stub renders `[data-screen-id="UF-01.1"]` for every path under `/welcome/*`, with the `<h1>` text
"Welcome". Web-shell tests (T-0300b, T-0301a) rely on that stub in two ways.

**(a) UF-01.1 as the marker for "the `/welcome/*` splat rendered, with no redirect", on sub-paths:**
- `apps/web/src/app/auth-guard.test.tsx`: "signed out: /welcome/goal renders without a redirect".
- `apps/web/src/app/__tests__/profile-gate.test.tsx`:
  - AC-7: the `missing` stand-down `it.each`, the no-bounce `Recorder` `it.each`, the in-place
    `SIGNED_IN` `it.each`, its `present` contrast case, and the "never settles, fails open" `it.each`.
  - AC-9: `/welcome/goal` signed out.
  - AC-11 (`/welcome/save`), the `/account` `missing` row, the D-0073 §3 `stale` row, and AC-5's
    redirect target (`/welcome/save`).

  Several of these are `it.each` tables that list `/welcome/goal` or `/welcome/save` together with
  `/welcome` under one body that asserts UF-01.1.

**(b) Synchronous first-render text queries on the stub `<h1>`:**
- `apps/web/src/app/auth-guard.test.tsx:131` (T-0300b AC-B6): `screen.getByText("Welcome")`.
- `apps/web/src/app/__tests__/profile-gate.test.tsx:702` (T-0301a AC-10): `screen.getByText("Welcome")`.

  The built UF-01.1 heading is "Train with a plan. / Log in seconds." (prototype
  `UF01-1-Welcome.dc.html`), so both queries fail once UF-01.1 is built.

D-0071 §2 (which replaces D-0063 §2) says each sub-screen renders its own `data-screen-id`. Once
T-0301b builds UF-01.1 and UF-01.2, these rows fail although the routing they guard is unchanged.
D-0088 rules on the same shape for three Phase 3 shell tests. But `auth-guard.test.tsx` isn't one
of those three, and D-0088 names only Phase 3 routes.

## Decision
1. **Screen ids under `/welcome/*`.**

   | Path | Renders |
   |---|---|
   | `/welcome` | UF-01.1 |
   | `/welcome/goal` | UF-01.2 |
   | `/welcome/level` | UF-01.3 |
   | `/welcome/schedule` | UF-01.4 |
   | `/welcome/save` | UF-01.1, until T-0301c builds it |
   | any other sub-path | UF-01.1, with no redirect |

   The `routes.ts` entry `/welcome/*` keeps `screenId: "UF-01.1"` (the flow's entry screen).
2. **D-0088 applies to the UF-01 rows, in one shape.** In `auth-guard.test.tsx` and
   `profile-gate.test.tsx`, a row that asserts UF-01.1 on a `/welcome/<sub>` path exists only
   because the splat was a stub. The UF-01 ticket that builds that sub-path handles it this way:
   - **Shared `it.each` table:** remove the sub-path from the array, and add a sibling case for
     that path alone. The sibling copies the shared body (same auth and profile state, same
     location and no-bounce assertions), with the built screen's id in place of UF-01.1. The
     shared body and the other entries in the array stay byte-identical.
   - **Single case for that path:** change only the expected screen id.

   The guarantee stays the same: same path, same state, no redirect, no bounce through `/`.
3. **The two synchronous text queries** (`auth-guard.test.tsx:131` AC-B6 and
   `profile-gate.test.tsx:702` AC-10) may point at the built UF-01.1 heading instead of the stub
   "Welcome". Use the heading from `en.uf01`, or `getByRole("heading", { level: 1 })` together
   with the UF-01.1 screen id. Each stays a synchronous first-render assertion, with no
   `await`/`waitFor` before it. T-0331 still owns AC-10's order-dependence.
4. **Grants.**
   - T-0301b: the `/welcome/goal` rows in both files, and both text queries from §3.
   - T-0301c: the `/welcome/save` rows, in the same §2 shape.
   - T-0301d: none. No web-shell test visits `/welcome/level` or `/welcome/schedule`.

   Every other row stays byte-identical. Review checks this.

## Consequences
- T-0301b and T-0301c each list the two files as extras in `## Paths you may change`.
- T-0301b, T-0301c, T-0366 and T-0331 all touch `profile-gate.test.tsx`. Don't run any two of them
  in parallel.
- `tests/e2e/auth.spec.ts` asserts UF-01.1 only on `/welcome` and `/`, so it is unaffected.

## Revisit when
- T-0301c has merged. No stub-era UF-01 row is left then, and this grant expires.
