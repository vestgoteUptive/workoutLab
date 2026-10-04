---
id: T-0480
title: "guarded-test.ts detector 2: an already-fulfilled request can still fire requestfailed/ERR_ABORTED right before a hard navigation tears the frame down (D-0173, T-0469 AC-2)"
lane: qa
screens: []
decisions: [D-0173]
deps: []
status: ready
---
<!-- Written 2026-10-03 by orchestrator (D-0173, a T-0469 build finding). Build flow: wl-build-qa. Small-to-medium: the root cause needs a second look before the fix. -->

## Why
T-0469's AC-2 (UF-11.4 real account deletion e2e) drives a real DELETE + a real local sign-out,
both mocked to return 204, followed by `AccountSettingsBody.onDelete`'s correct, existing hard
`window.location.replace("/welcome")` (D-0136 §4). Measured directly (a temporary `requestfailed`
listener, then removed): both responses are genuinely fulfilled with 204, and the app behaves
correctly — yet Chromium *also* reports both as `requestfailed` with `net::ERR_ABORTED`, because
the hard navigation tears the frame down while those responses are still finalizing. Read D-0173
in full for the measured evidence; it is not restated here.

**Open question for this ticket to resolve, not assumed:** `tests/e2e/fixtures/guarded-test.ts`'s
detector 2 (`context.on("requestfailed", …)`, around line 145) already has `if
(routed.has(entry)) return;` (line 148), which on its face should already exempt any request that
was fulfilled by a `page.route` handler — `routed.add(entry)` happens at the fulfillment site
(line 103) and is never removed per-entry, only `routed.clear()`'d at teardown (line 181). So
either:
- the `entry` key (`${method} ${url}`) at the `requestfailed` callback doesn't match the key that
  was added at fulfillment time for T-0469's specific DELETE/logout calls (check for a redirect,
  a retried request, or a URL that differs by trailing slash/query between the two sites), or
- `routed` is genuinely empty or stale by the time `requestfailed` fires for these two requests,
  because the hard navigation's frame teardown races the event firing before `routed.has` runs.

Start by reproducing T-0469 AC-2's failure with a temporary log of `entry` and `routed`'s contents
at the moment `requestfailed` fires, before changing anything.

## Scope
- In: `tests/e2e/fixtures/guarded-test.ts` only — the `requestfailed` listener (detector 2) and,
  if the root cause needs it, the fulfillment-side bookkeeping (`routed.add`) a few lines above.
- Out: `tests/e2e/uf-11-account.spec.ts`, `AccountSettingsBody.tsx`, `lib/account` — all correct
  and out of scope (D-0173 §3). Don't change the hard-navigation branch to dodge this.

## Acceptance criteria
- **AC-1 (root cause found, not assumed)** The build log states, with evidence (a temporary log
  or probe, removed before the final diff), why `routed.has(entry)` doesn't already exempt this
  case today.
- **AC-2 (fix, red on main)** `tests/e2e/uf-11-account.spec.ts`'s AC-2 (already written, in
  `web-feature:UF-11`'s T-0469 branch, merged by the time this runs) goes green with no change to
  that spec file. Confirm it is genuinely red on unfixed `guarded-test.ts` first.
- **AC-3 (no regression)** The full e2e suite stays green, especially `offline.spec.ts` (the
  comment block above detector 2 already documents a past regression from a too-broad fix) and
  `fixture-guard.spec.ts`'s own self-tests of the guard's failure detection.
- **AC-4** Whatever the fix is, it must not weaken the guard's ability to catch a real unmocked
  leak (the entire reason detector 2 exists, D-0090).

## Definition of done
Tests pass · the whole web e2e green · `npx -y pnpm@10.28.2 -w typecheck lint test
--concurrency=1`, `-w test:repo-checks`, `-w format:check`, `node .github/scripts/check-all.mjs`
green, each via `scripts/locked.sh heavy` · contracts unchanged · commits start `T-0480`.

## Build / accept log
Archived in `docs/tickets/log/T-0480.md` (D-0157).
