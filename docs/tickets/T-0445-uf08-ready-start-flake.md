---
id: T-0445
title: "Flake: UF-08 ready-start.test.tsx retry tests fail under load — find the timing assumption and replace it with a real wait"
lane: web-feature:UF-08
screens: [UF-08.4]
decisions: [D-0110, D-0158, D-0169, D-0178]
deps: []
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48. Seen twice in full -w gates under
load: T-0422 rework (2026-10-02) and the T-0485 merge gate (journal 2026-10-04); each passed alone.
A flake in the unit gate can turn CI red on main and block the automatic deploy. Build flow:
wl-build-web. About ¼ day. Test-only; small unless the cause is in Ready.tsx. -->

## Why
`apps/web/src/features/UF-08/__tests__/ready-start.test.tsx`, test "retry: the second tap reuses
the same id and navigates once on resolve", failed once in each of two full gates and passed alone
every time. The next test in the same describe ("a new visit: Back to UF-08.2…") uses
`findByRole("alert")` and `waitFor` with the default 1 s timeout across a lazy route, which is the
same shape. A red unit gate on `main` stops the deploy pipeline, so this is worth a real fix.

## Scope
- In: reproduce under load, find which wait is too short or which assumption is timing-based, and
  fix it with a real wait (an awaited state, or the file's `LAZY_WAIT_MS` budget on every wait that
  crosses a lazy route).
- In: the same review for every test in the file's retry/new-visit describe.
- Out: `Ready.tsx` behaviour. If the cause turns out to be a real product race (for example the
  Start button's `busy` flag), stop and write it up as a follow-up with the evidence rather than
  changing product code here.

## Acceptance criteria
- **AC-1 (reproduce)** Record in the log one failing run on main 573ff48 (or later) and how it was
  produced: for example the file run 30 times in a loop through `scripts/locked.sh small` while a
  `heavy` gate runs in another worktree, or with the CPU throttled. If no failure appears in 60 runs
  under load, record that and go to AC-2's planted latency instead.
- **AC-2 (planted latency)** Given the `upsertSession` spy delays every call by 300 ms before it
  settles, and the focus route's lazy import is delayed by 1500 ms (planted in the test, reverted
  after), then every test in the describe still passes. **Red before the fix:** at least one fails
  with those delays (record which).
- **AC-3 (no fixed sleeps)** The fix adds no `setTimeout`-based sleep and no retry loop around an
  assertion; every new wait is on an observable state (role, test id, spy call count).
- **AC-4 (stable)** After the fix, the file passes 30 consecutive runs under the AC-1 load, and the
  whole UF-08 test folder passes.

## Paths you may change
- `apps/web/src/features/UF-08/__tests__/**` (the lane: `web-feature:UF-08`, tests only).
- `docs/tickets/T-0445-uf08-ready-start-flake.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
AC-1 and AC-2 evidence recorded · AC-4's 30 runs green · `pnpm -w typecheck lint test` green plus
`-w test:repo-checks` · commits start with `T-0445` and cite UF-08.4.

## Build / accept log
