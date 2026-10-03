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

### Build log (T-0480, resumed after a spend-limit stop)
- **AC-1 root cause (measured, temp log removed):** neither ticket hypothesis. The `entry` key matched and `routed` was not stale: `routed` is only filled by the *context* catch-all route, and a request a spec's own `page.route` fulfils never reaches it, so `routed` was empty for T-0469's page-fulfilled DELETE + local logout. Chromium then reported both `requestfailed: net::ERR_ABORTED` because the app's correct hard `location.replace("/welcome")` tore the frame down.
- **Fix** (`tests/e2e/fixtures/guarded-test.ts` only): `fulfilledResponses` set filled by `context.on("response")` for Supabase URLs from any route; detector 2 returns early when the entry is in it (and `reset` clears it). A `route.continue()` leak to the unresolvable host never gets a response (DNS fails), so it is still caught. Not widened to `requestfinished` or "no failure text" (those exempt a continue leak: the past regression in the comment block). Comment block added in-file.
- **AC-2 red on main / green fixed:** on HEAD guard, with T-0469's spec + fixture copied in untracked (T-0469 is not merged in this branch; removed afterwards, no change to that spec): `unclaimed supabase request: DELETE .../functions/v1/account, POST .../auth/v1/logout?scope=local`. With the fix that error is gone. NOTE: the AC-2 test still fails here, on a different line (see finding below), so AC-2 of this ticket is met for the guard part only.
- **AC-4 / regression test:** new `fixture-guard.spec.ts` "T-0480 a page-fulfilled request aborted by a hard navigation is not reported". A first version (one awaited fetch then navigate) did not provoke the abort and passed unfixed, so it was useless; the version with a second in-flight fetch is red on the unfixed guard (`unclaimed ... POST .../fulfilled_then_nav`), green fixed 4/4. Existing `route.continue()` test still passes (the leak is still caught).
- **Full web e2e (fixed):** 218 passed (1.5m), incl. offline.spec.ts and all fixture-guard self-tests.
- **SEPARATE FINDING (not part of this fix; belongs to T-0469 / web-shell + UF-11):** T-0469 AC-2's `getByText("Your account and all your data are deleted.")` assertion on /welcome fails deterministically here (3 runs; the guard fix does not change it). Probe: the page is a fresh load (hard `location.replace` branch taken), and `sessionStorage["wl-account-deleted"]` is already null on /welcome. Reading the code: `AccountDeletedNotice` is mounted globally (App.tsx) and `consume()`s the key on the in-page SIGNED_OUT; `AccountSettingsBody.onDelete` checks `statusRef.current === "signed-out"` right after the await. Which branch runs depends on whether React re-rendered between SIGNED_OUT and the await resuming. When the re-render has not happened, hard reload runs, but the key has been consumed by the old page's notice (status effect) so the new page shows nothing. This is a machine-timing-dependent race (passed for T-0469's author, fails deterministically here), not a version mismatch. Likely fix: do not consume the key in the old page when a hard navigation follows (or always SPA-navigate / always hard-navigate), plus a unit test. Follow-up filed in the handback. The same T-0469 branch also fails AC-3 (500 case) and AC-5 44x44 here, unrelated to the guard: not investigated.
