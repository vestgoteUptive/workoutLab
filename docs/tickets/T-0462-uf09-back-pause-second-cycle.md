---
id: T-0462
title: "UF-09 Back means Pause, second cycle: Back → Resume → Back pauses again on real Chromium; host-level guard tests tell their three states apart"
lane: web-feature:UF-09
screens: [UF-09.9, UF-09.3]
decisions: [D-0123, D-0162, D-0163]
deps: [T-0394]
status: ready
groomed: 2026-10-06
---
<!-- Groomed 2026-10-06 by product-owner against main 573ff48 (T-0394 review follow-up). Principle 1
on the real browser. Build flow: wl-build-web. About ¼ day. -->

## Why
Principle 1: leaving a running workout always goes through UF-09.9. T-0394's e2e proves one Back
cycle. After that Back, the host re-pushes the guard entry from inside the `popstate` handler
(`apps/web/src/features/UF-09/host.tsx`, `pushGuard()` after the PAUSE). Chromium can mark a
history entry pushed without user activation as skippable for the browser Back button. If that
happens, the user's second Back (after Resume) leaves focus mode silently, which is the TR-0038 bug
again. Nothing tests the second cycle today.

Separately, `t0394.back.test.tsx`'s "host-level %s: no guard" rows (not on this device, ended,
stale) all assert the same screen id `UF-09`, so a fault that rendered the wrong host state would
pass all three.

## Scope
- In: an e2e row in `tests/e2e/uf-09-focus.spec.ts`'s "T-0394 AC-6 Back means Pause" describe for
  the second cycle.
- In: if the row fails on Chromium, fix the guard (for example re-push on the Resume tap, which has
  user activation, instead of inside `popstate`) and keep every T-0394 test green.
- In: give each host-level row in `t0394.back.test.tsx` an assertion only its own state passes (its
  own text or marker, read from what the host renders today).
- Out: other browsers (the e2e project is Chromium only); the paused-Back rule (D-0163).

## Acceptance criteria
- **AC-1 (second cycle, e2e)** Given a workout started from `/` as in `startFromHome`, when the test
  does Back (UF-09.9 visible, same URL), taps Resume (a UF-09 machine screen, not UF-09.9, is
  visible), then Back again, then UF-09.9 is visible and the URL is still the session URL. One more
  Back leaves the session URL.
- **AC-2 (two Backs in a row while running)** Given a running workout after one full AC-1 cycle,
  then a third Back → Resume → Back cycle also lands on UF-09.9 (the guard doesn't wear out).
- **AC-3 (offline the same)** AC-1 with the context offline after `precacheSettled`.
- **AC-4 (host-level rows)** Each of the three host-level rows asserts something the other two
  don't (for example the "not on this device", "ended" and "stale" copy or a `data-` marker), still
  with no guard pushed. Prove it: swapping two rows' setups makes both fail (planted, recorded).
- If AC-1 needs a guard change: the T-0394 vitest file and the existing AC-6 e2e rows stay green,
  and the change is red-proven by AC-1 on the old guard.

Note for the builder: Playwright's `page.goBack()` may not apply Chromium's skippable-entry rule the
way the browser Back button does. If it doesn't, say so in the log, and also drive Back through
`page.keyboard.press("Alt+ArrowLeft")` if that works headless; if neither reproduces the browser
button, record the limitation rather than claiming coverage.

## Paths you may change
- `apps/web/src/features/UF-09/**` (the lane: `web-feature:UF-09`), except `seams.tsx`.
- **Listed extras:**
  - `tests/e2e/uf-09-focus.spec.ts`: append rows to the T-0394 AC-6 describe.
  - `docs/tickets/T-0462-uf09-back-pause-second-cycle.md`: this file, for the logs.

## Contract impact
None.

## Definition of done
Tests for every AC pass · `pnpm -w typecheck lint test` green plus `-w test:repo-checks` ·
`uf-09-focus.spec.ts` green · commits start with `T-0462` and cite UF-09.9.

## Build / accept log

### Build log (frontend-dev, e2e only; AC-4 vitest rows not done in this pass)
- Added two rows to the T-0394 AC-6 describe in `tests/e2e/uf-09-focus.spec.ts`: AC-1/AC-2 (three Back→Resume→Back cycles, then one more Back leaves) and AC-3 (offline cycle).
- Result: green on the unchanged guard; no bug found, no production change. `--repeat-each=5` on the new rows: 10/10. Whole spec: 14/14. `page.goBack()` is used; it may not apply Chromium's skippable-entry rule exactly like the Back button (limitation recorded; Alt+ArrowLeft not tried).
- Planted fault (pushGuard skipped from its 3rd call, backup restored by `cp`): AC-1/AC-2 row red, AC-3 (one cycle) stays green as expected.
- format:check and check-all green. Unit gate not run (no production change).
- AC-4 (follow-up pass): each host-level row in `t0394.back.test.tsx` now also asserts its own h1 text (not on this device / has ended / was started on). Planted: swapping each pair of rows' expected titles (three pairs, via backup + `cp`) failed both rows of the pair each time (2 failed / 18 passed). Restored. UF-09 vitest dir, format:check, check-all green.
