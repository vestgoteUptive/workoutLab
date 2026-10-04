---
id: T-0486
title: "AccountDeletedNotice: the hard-navigation delete path can consume `wl-account-deleted` on the old page before /welcome ever reads it, so the notice sometimes never shows"
lane: web-shell
screens: [UF-01.1, UF-11.4]
decisions: [D-0136, D-0173]
deps: [T-0480]
status: ready
---
<!-- Written 2026-10-03 by orchestrator, from a T-0480 build finding (docs/tickets/T-0480-guard-err-aborted-exemption.md, "SEPARATE FINDING"). Build flow: wl-build-web. Small: one file, one race, one test. -->

## Why
`AccountSettingsBody.onDelete` (`apps/web/src/features/UF-11/AccountSettingsBody.tsx:121-137`) takes
one of two branches after a successful delete + local sign-out:
- `statusRef.current === "signed-out"`: `navigate("/welcome", { replace: true })` — an SPA
  navigation. The old page's components unmount normally; nothing else races.
- otherwise: `window.location.replace("/welcome")` — a **hard** navigation, chosen deliberately
  (T-0310c rework 2) because the in-memory session might not have cleared yet, and a guest-only
  `/welcome` would bounce a signed-in load back to `/`.

`AccountDeletedNotice` (`apps/web/src/components/account-deleted-notice/AccountDeletedNotice.tsx`,
mounted globally in `App.tsx`) reads `sessionStorage["wl-account-deleted"]` two ways: synchronously
at mount (`useState(peek)`), and reactively in an effect whenever `status` becomes `"signed-out"`
while already mounted (lines 76-82). The second path exists for the SPA-navigate branch above: the
same page instance sees `SIGNED_OUT`, consumes the key, and shows the notice without a reload.

The race: on the hard-navigation branch, `useAuth()`'s `SIGNED_OUT` event can still reach the old,
about-to-be-torn-down page's `AccountDeletedNotice` instance **before** `location.replace`'s
navigation actually unloads the document. If that effect runs first, it calls `consume()`, which
deletes the sessionStorage key — the notice renders on the old page for the instant before unload,
which nobody sees, and the new `/welcome` page's `peek()` at mount finds nothing. Whether this
happens depends on whether a React re-render landed between `SIGNED_OUT` firing and `location.replace`
actually tearing down the frame — a machine-timing race, not a logic bug with one deterministic
outcome. It reproduced deterministically on one machine (T-0480's build) and passed on another's (the
T-0469 author's), both running the identical code.

D-0173 (T-0480) separately fixed the e2e guard's false-positive report on this same flow's aborted
requests; that fix does not touch this — this is a real, reproducible product race, not a test
artifact, and it blocks T-0469's AC-2 from going green on at least one real machine.

## Scope
- In: `apps/web/src/components/account-deleted-notice/AccountDeletedNotice.tsx` only.
- Out:
  - `apps/web/src/features/UF-11/AccountSettingsBody.tsx` — its branch choice between SPA-navigate
    and hard-navigate is correct (T-0310c rework 2) and out of scope. Don't change which branch
    runs or when.
  - `apps/web/src/lib/account/**` — the key's value and when it's set are correct and unrelated.
  - `tests/e2e/uf-11-account.spec.ts` — no change needed; AC-2 already asserts the right thing.

## Acceptance criteria
Each new test title starts with `T-0486 AC-n`. Use `apps/web/src/components/account-deleted-notice/__tests__/AccountDeletedNotice.test.tsx` (existing file).

- **AC-1 (root cause confirmed, not assumed).** Before changing the component, write a test that
  reproduces the race deterministically in jsdom: mount `AccountDeletedNotice` with `status` starting
  at something other than `"signed-out"`, set `sessionStorage["wl-account-deleted"] = "1"`, then
  change `status` to `"signed-out"` (simulating the in-page `SIGNED_OUT` event reaching the old page)
  — confirm the effect consumes the key (sessionStorage is now empty) even though no SPA navigation
  follows. This is the bug: the key is gone, and nothing on the next page can read it. Record this
  as the red/confirming case, not a planted fault.
- **AC-2 (fix).** After the fix, the reactive `status === "signed-out"` consumption path must not
  fire in a way that can race a hard navigation unloading the page. The notice must still work for
  its two real cases:
  - **SPA-navigate case (same-page, no reload):** `AccountSettingsBody`'s own branch already
    navigates while staying mounted in the same document — if `AccountDeletedNotice` is mounted
    on the destination route (e.g. inside the same SPA shell, not remounted), the existing
    mount-time `peek()` on `/welcome`'s render is enough, because React Router's navigation
    doesn't reload the document; `AccountDeletedNotice` is already present (mounted in `App.tsx`,
    outside the route tree) and was never unmounted, so its synchronous mount-time read already
    happened before the delete — it needs the reactive path to catch the post-navigation value.
    Re-examine whether the reactive effect is still needed for this case specifically, or whether
    a key-change/storage-event listener model avoids the hard-navigation race while keeping the
    SPA case working. Don't assume the fix shape before checking this.
  - **Hard-navigate case (full reload):** the new page's `/welcome` mount-time `peek()` must see
    the key, meaning the old page's instance must not consume it first. One direction: only
    consume reactively when you can confirm no unload is imminent (there is no reliable signal for
    this), or: don't consume on the `status` transition at all, and instead rely on a
    `storage`/`visibilitychange`/mount-only model. Pick whichever approach keeps both cases correct
    and is simplest; justify the choice in the build log with both AC-1-style repro tests passing.
- **AC-3 (no regression).** Every existing test in `AccountDeletedNotice.test.tsx` passes unedited
  (dismiss button, "partial" kind, storage-unavailable fallback, etc.).
- **AC-4 (fault proof).** On a backup copy, revert the fix (restore the old reactive consume).
  AC-1's repro test must fail. Restore from the copy; record it.

## Paths you may change
- `apps/web/src/components/account-deleted-notice/AccountDeletedNotice.tsx`
- `apps/web/src/components/account-deleted-notice/__tests__/AccountDeletedNotice.test.tsx`
- `docs/tickets/T-0486-account-deleted-notice-race.md` (this file, accept log only)

## Contract impact
None.

## Definition of done
Every AC has a passing test. `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`, `-w test:repo-checks`, `-w format:check` and `node .github/scripts/check-all.mjs` all pass. e2e not required (jsdom-only change, no `tests/e2e/**` touched) but if time allows, confirm `tests/e2e/uf-11-account.spec.ts` AC-2 passes locally with `--repeat-each=5` to raise confidence the race is actually closed, not just the unit repro. Commits start `T-0486` and cite UF-01.1/UF-11.4.

## Notes
- **Not a test-timing issue.** The jsdom repro in AC-1 is deterministic, not a flake — it directly
  asserts the ordering bug, not a timing coincidence.
- **T-0469 (web-feature:UF-11, account e2e) is separately blocked on this.** Once this merges,
  T-0469 should re-run its AC-2 to confirm the real race is closed (not just the guard's false
  positive, which T-0480 already fixed).
- T-0480's build also noted T-0469's own spec fails AC-3 (500 case) and AC-5 (44×44) independent of
  any of this — not investigated, out of scope here, left for T-0469 itself to re-check once
  rebased onto T-0480 and this ticket.

## Build / accept log
Archived in `docs/tickets/log/T-0486.md` (D-0157).
