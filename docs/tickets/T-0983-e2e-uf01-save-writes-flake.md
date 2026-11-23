---
id: T-0983
title: "Root-cause the UF-01.5 AC-14 save-writes e2e failure under load (writes recorded as [] instead of area_targets, profiles)"
lane: qa
screens: [UF-01.5, UF-02.1]
decisions: [D-0197]
deps: []
status: done
---
## Why
During T-0981 (2026-11-23), `tests/e2e/uf-01-onboarding.spec.ts` line ~369 (UF-01.5 AC-14) failed once in 140 runs under CPU pressure: `expect(writes.map((w) => w.table)).toEqual(["area_targets", "profiles"])` received `[]`, although UF-02.1 was already visible. Either the recorder misses requests (route registration order, a request served from another handler, or the write sent after the screen changes), or the app shows UF-02.1 before the writes are sent (a product defect: onboarding data could be lost on a fast close).

## Scope
- In: reproduce, find which of the two it is with evidence, fix the test if it is the test; if it is the app, report it with file:line and a proposed fix (and a follow-up ticket for the web lane).
- Out: app code changes in this ticket.

## Acceptance criteria
- AC1 The log names the cause with evidence (request timeline from a reproduced run).
- AC2 If test-side: the test waits on the real writes (e.g. `waitForRequest`) rather than reading the recorder once; `--repeat-each 30` under load is green.
- AC3 If app-side: a follow-up ticket exists with the defect, and the test keeps failing on it rather than being loosened.
- AC4 A planted fault (profile write dropped) still turns the test red.

## Paths you may change
`tests/e2e/**`

## Contract impact
none.

## Definition of done
Every AC has evidence · `-w lint:e2e`, `-w format:check` green · commit messages start with `T-0983`.

## Build / accept log
- Build (qa, 2026-11-23). CAUSE (test-side, with evidence): reproduced 5/30 with `--repeat-each 30 --workers 6` plus 8 busy loops on 4 cores. Request timeline of a failing run: `/account` POST auth/v1/verify (2044 ms) -> NAV `/` (2177) -> GET rest/v1/profiles (2386) -> first `area_targets`/`session_sets_live` GETs for `/`; no POST ever seen when the test read the recorder. `ProfileGate` (`apps/web/src/lib/profile/ProfileGate.tsx:15-18`) renders the gated route while the profile is `unknown` and redirects to `/welcome/save` only on `missing`, so UF-02.1 shows briefly first (by design, AC-6 of that gate) and `await expect(UF-02.1).toBeVisible()` passed before `/welcome/save` mounted and wrote. The app writes sequentially and awaits both before leaving `/welcome/save` (`SaveScreen.tsx:121-140`), so no data-loss path found; the only app-side effect is a brief UF-02.1 flash for a new user (no follow-up needed beyond noting it). Not captured: the post-failure redirect itself (my 4 s "later" probe starved on the heavy lock); it is implied by the fixed test, which waits for both POSTs and passes 30/30.
- Fix: `waitForWrite` (`page.waitForRequest`, registered before sign-in) for `area_targets` and `profiles`, awaited before UF-02.1/URL/order assertions; assertions stay strict. AC2: 30/30 green under the same load. AC4: planted fault (profile upsert removed in `SaveScreen.tsx`, backup copy, restored with cp, cmp clean, not committed) -> test red (`waitForRequest` timeout). AC3: n/a (test-side).
- UF-01 AC1 data point (coordinator): "every step is a plan-state root" failed once with UF-01.4 not found. NOT reproduced (40/40 on the original `gotoStep` under load). Different mechanism from AC-14 (no gate flash involved); plausible cause is `gotoStep` clicking "Continue" before the next lazy step mounted, ending one screen short. Hardened `gotoStep` to await UF-01.2/.3/.4 after each click; unproven fix, flagged as such.
- Runs: whole `uf-01-onboarding.spec.ts` x3 under load, 84/84 green; `-w format:check`, `-w lint:e2e` green; `check-all` reported ticket-not-on-base (still reported after merging main-hzlbfc: the ticket file is not on `main`, orchestrator action).
