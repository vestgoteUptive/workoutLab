---
id: T-0492
title: "UF-11 offline.test.tsx: pin the last-synced time to the literal 08:10 and drop the stale 8:10 comment"
lane: web-feature:UF-11
screens: [UF-11.2]
decisions: [D-0084]
deps: [T-0449, T-0471]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48 (T-0449 follow-up; the UF-06 twin,
T-0491, is done). Build flow: wl-build-web. About 1/16 day; small (D-0178). Same lane as T-0529:
don't run them at the same time. -->

## Why
T-0449 made `formatTime` use a 2-digit hour, so `en-GB` renders `08:10`. The UF-11 test still
accepts `8:10` (`/^0?8:10$/`) and its comment says the component renders `8:10`
(`apps/web/src/features/UF-11/__tests__/offline.test.tsx`, around line 113–124). The loose pattern
would let a regression back to `8:10` pass.

## Scope
- In: replace the regex with the literal `"08:10"`, and rewrite the comment to say AC-B6's
  `Offline · last synced 08:10` is what ships (T-0449).
- Out: any product code.

## Acceptance criteria
- **AC-1** The test asserts `formatTime("2026-09-27T06:10:00Z", FORMAT_OPTS) === "08:10"` and that
  the rendered text is `en.offline.lastSynced("08:10")`.
- **AC-2 (fault)** With `formatTime`'s hour planted back to `"numeric"` (on a backup copy, restored
  by `cp`), the test fails. Record it.
- **AC-3** No comment in the file says the component renders `8:10`.

## Paths you may change
- `apps/web/src/features/UF-11/__tests__/offline.test.tsx` (the lane: `web-feature:UF-11`).
- `docs/tickets/T-0492-uf11-offline-test-literal-time.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
AC-1..AC-3 hold · the UF-11 test folder green · `pnpm -w typecheck lint test` green plus
`-w test:repo-checks` · commits start with `T-0492`.

## Build / accept log
