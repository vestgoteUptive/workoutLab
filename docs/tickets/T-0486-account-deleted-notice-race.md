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

2026-10-03 web-shell build (T-0486). Branch `t/T-0486-account-notice-race`, worktree clean at
start (HEAD = main `ed2a5e7`).

**AC-1 (repro, red first).** Added `T-0486 the hard-navigation race` describe block to
`AccountDeletedNotice.test.tsx`: mocks `useAuth` directly (gated by `mockAuth.active`, so the
existing `App`-based AC10 tests still use the real `AuthProvider`), mounts `AccountDeletedNotice`
alone, drives `status` via `mockAuth.status` + `rerender`, drives the URL via the file's existing
`at()` helper (`history.replaceState`, no reload). First run against unfixed code: AC-1 test red
as expected (`sessionStorage.getItem(KEY)` was `null` after the status flip to `signed-out` with
no navigation — confirms the race: `npx vitest run .../AccountDeletedNotice.test.tsx` → 5 failed /
8 passed, all 5 failures in the new T-0486 describe block, for the right reason (key removed /
notice not shown) once an unrelated test-setup bug (see below) was fixed.

**Root cause, more precisely than the ticket's framing.** Two distinct reactive paths land on
`/welcome` while `AccountDeletedNotice` stays mounted: (a) `AccountSettingsBody`'s own
`navigate("/welcome", { replace: true })`, and (b) `RequireAuth`'s own `<Navigate>` redirect when
`status` flips to `signed-out` on a protected route (not mentioned in the ticket, but it's the
exact path the pre-existing "T-0310c AC10 same page" test exercises). Both are real
`react-router` `<Navigate>` components whose actual `history` call happens in a `useEffect` of
their own — same commit as `AccountDeletedNotice`'s own effect, but *after* it in flush order
(`AccountDeletedNotice` is rendered before `<Routes>` in `Shell`). So a same-tick
`window.location.pathname` check in `AccountDeletedNotice`'s effect is unreliable (confirmed by a
first fix attempt using exactly that, which broke the pre-existing "same page" test — recorded as
an interim red run below, not a fault).

**Fix (AC-2).** `AccountDeletedNotice.tsx`: the reactive `status === "signed-out"` path now (1)
`peek()`s only (read-only) to update `kind` immediately, same tick, so the notice still shows
right away in both SPA cases, and (2) schedules a `setTimeout(0)` that *consumes* (removes from
storage) only if `window.location.pathname` is `"/welcome"` by the time it fires. The timeout
runs after every effect in the commit has flushed (including any `<Navigate>`'s), so it reliably
sees a same-commit SPA redirect's URL, whichever of the two paths produced it. The hard-navigate
branch never touches the SPA route — it reloads the document, unmounting this instance (and
cancelling the pending timeout via the effect's cleanup) well before the timeout could ever fire
against a stale `/welcome` read. The mount-time read is unchanged: still a synchronous,
unconditional `consume()`, so a hard navigation's new page still reads and clears the key the same
tick as before.

Rejected alternative: importing `useLocation` from `react-router` directly (cleaner code, but
`src/lib/account/__tests__/boundaries.test.ts` (T-0310c AC11, outside this ticket's scope to
touch) asserts this file's exact static-import list — `react-router` is not in it. Caught by the
full gate's `test` step; reverted in favour of a plain `window.location.pathname` DOM read, which
needs no new import.

**AC-3 (no regression).** Every pre-existing test in the file passes unedited, including the
"T-0310c AC10 same page: signed in on /, key set, SIGNED_OUT → the notice appears" test, which
exercises the `RequireAuth`-redirect SPA path end-to-end through the real `App` and was the one
test that caught the first (same-tick) fix attempt's flaw.

**AC-4 (fault proof).** Backed up the fixed `AccountDeletedNotice.tsx` to the scratchpad twice (one
per fix iteration), edited the live file in place to restore the old unconditional reactive
`consume()` (removing the `peek`/deferred-`consume` split), ran `AC-1` alone: failed
(`sessionStorage` was `null`, expected `"1"`), confirming the fault is caught. Restored the fixed
file from the scratchpad backup (`cp`, not `git checkout`) both times; `git diff` showed no
uncommitted drift afterwards.

**Tests run** (`apps/web`, via `scripts/locked.sh small npx vitest run
src/components/account-deleted-notice/__tests__/AccountDeletedNotice.test.tsx`):
- Red (AC-1, pre-fix): 5 failed / 8 passed (first run before fixing an unrelated mock-scoping bug
  in the new tests themselves) → after fixing that, 1 failed (AC-1 only, as intended) / 12 passed.
- First fix attempt (same-tick `window.location.pathname`, no `setTimeout`): broke the pre-existing
  "same page" AC10 test (1 failed / 12 passed) — diagnosed as the effect-ordering issue above, not
  used in the final fix.
- Final fix: 13 / 13 passed.
- AC-4 fault run: 1 failed (AC-1) / 12 skipped (ran `-t "T-0486 AC-1"` only), as required.
- Full `apps/web` suite after the final fix and restore: 253 files / 3513 tests passed (via
  `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w typecheck lint test --concurrency=1`), confirming
  `lib/account/__tests__/boundaries.test.ts`'s import-boundary test (T-0310c AC11) is unaffected by
  the final (no-new-import) fix.
- `npx -y pnpm@10.28.2 -w test:repo-checks`: 159/159 passed.
- `npx -y pnpm@10.28.2 -w format:check`: clean.
- `node .github/scripts/check-all.mjs`: clean (no output, exit 0).

**e2e**: not required (jsdom-only change). `tests/e2e/uf-11-account.spec.ts` does not exist in this
worktree (T-0469 is a separate, not-yet-merged lane), so the optional `--repeat-each=5` confidence
check from the Definition of done could not be run here; left for T-0469 to confirm once rebased
onto this ticket, per its own note above.

Commits: `T-0486 UF-01.1/UF-11.4: ...` (component fix + tests), citing both screen IDs.

---

**Rework (same day), after code review requested changes — disqualifying flaw found.** QA
(commit `fa0eddd`) had already added two edge-case tests on top of the above fix (already-on-
`/welcome` with no redirect, and rapid re-renders), both passing. Code review then found that the
pathname-gate fix above is **defeated** by the exact topology it was meant to handle: `/plan/account`
(where `AccountSettingsBody.onDelete` lives, routes.ts) is `guard: "protected"`, wrapped in the
real `RequireAuth` (`lib/auth/guards.tsx`), which is itself *live* — the instant `status` becomes
`"signed-out"`, it renders `<Navigate to={redirectTarget} replace />` **on both the SPA-navigate
and the hard-navigate delete branches alike**, because `RequireAuth` has no way to know which
branch `AccountSettingsBody` is about to take. So on the hard-navigate branch, `RequireAuth`'s own
redirect still flips `window.location.pathname` to `/welcome` via the History API, before
`window.location.replace(...)` has actually unloaded the document — the pathname gate reads
"/welcome" and wrongly consumes anyway. Same bug, delayed one tick. My test harness (a bare
`AccountDeletedNotice` plus a hand-driven `at()` pathname helper) never modelled `RequireAuth`
actually running, so it couldn't have caught this — exactly the reviewer's point.

Reviewer's suggested direction: a real "unload is imminent" signal (`beforeunload`/`pagehide`)
instead of inferring it from pathname, since `location.replace(...)` dispatches these
synchronously before any of this component's deferred work runs.

**New fix.** `AccountDeletedNotice.tsx`: added a `pagehide`/`beforeunload` listener (registered
once per mount, into a `leaving` ref). The reactive path still `peek()`s immediately (unchanged)
and still defers the actual `consume()` via `setTimeout(0)`, but the timer's gate is now
`!leaving.current`, not a pathname check. `pagehide`/`beforeunload` fire synchronously as part of
`location.replace(...)`'s own call, strictly before this deferred timer can run, so the hard-
navigate branch's timer always sees `leaving.current === true` (and skips the consume) regardless
of what `RequireAuth` did to the SPA route in the meantime; the SPA-navigate and live-guard-
redirect cases never fire these events, so their timers always consume as before.

**Test rework.** Replaced the simplified `AccountDeletedNotice`-only harness in the `T-0486 the
hard-navigation race` describe block with a `Harness` component that renders `AccountDeletedNotice`
as a sibling of a real `<Routes>` tree containing `/plan/account` wrapped in the **real**
`RequireAuth` (imported from `lib/auth/guards.js`, not a stand-in) and a `/welcome` route — the
same shape as `Shell` (`App.tsx`). Used `BrowserRouter`, not `MemoryRouter`: a first draft of this
harness used `MemoryRouter`, which keeps its own in-memory history and never touches
`window.location` — it would have silently continued to pass against *both* the rejected
pathname-gated variant and the real fix, defeating the point of the rework. Caught this myself
before re-running the AC-4-style check: the rejected variant passed AC-1 against the
`MemoryRouter` harness, which shouldn't have been possible, and the root cause was exactly that
`window.location.pathname` was never actually changing. Switched to `BrowserRouter`; re-ran, and
the rejected variant then correctly failed 3 tests (AC-1, hard-navigate, second-re-render).

Added `firePagehide()` (dispatches a real `pagehide` `Event` on `window`) and a new explicit
discriminator test ("a fix that defers via timer but gates on pathname instead of pagehide... this
test only passes against the pagehide-gated fix"), plus reworked AC-1 and the hard-navigate test to
render through `Harness`, let `RequireAuth`'s redirect actually land on `/welcome`, and only then
fire `pagehide` — modelling the exact sequence the reviewer described. The two QA tests (already-
on-`/welcome`, rapid re-renders) needed no changes: they don't involve a guard redirect and still
pass unedited.

**Fault proofs (rerun against the new fix).**
- Planted the rejected pathname-gated variant (backup/restore via `cp`, scratchpad): AC-1, the
  hard-navigate test, and the second-re-render test all failed (3 failed / 13 passed) — confirms
  the new tests actually discriminate the exact flaw review found, not just the original bug.
  Restored from the scratchpad backup; `git diff` clean afterwards.
- Planted the ticket's own AC-4 fault (full revert to the pre-T-0486 unconditional reactive
  `consume()`): same 3 tests failed (3 failed / 13 passed). Restored from the scratchpad backup;
  `git diff` clean afterwards.

**Tests run (rework):**
- `scripts/locked.sh small npx vitest run .../AccountDeletedNotice.test.tsx`: 16/16 passed against
  the pagehide-based fix (13 pre-existing T-0486 + QA tests, plus the new discriminator; all pass).
- Same file against the rejected pathname-gated variant: 3 failed / 13 passed, as above.
- Same file against the ticket's full-revert fault: 3 failed / 13 passed, as above.
- Full gate after restoring the real fix: `scripts/locked.sh heavy npx -y pnpm@10.28.2 -w
  typecheck lint test --concurrency=1` → 253 files / 3516 tests passed (3 more than the earlier
  entry's 3513, from the discriminator test plus the two QA tests this log's earlier entry
  predates). `-w test:repo-checks`: 159/159. `-w format:check`: clean. `node
  .github/scripts/check-all.mjs`: clean, exit 0.

No contract or scope change: still only `AccountDeletedNotice.tsx` and its own test file. The test
file's new `BrowserRouter`/`Routes`/`RequireAuth` imports are test-only (this file isn't subject to
the component's own import-boundary test), so `lib/account/__tests__/boundaries.test.ts` (T-0310c
AC11) stays green, as confirmed in the full-gate run above.
