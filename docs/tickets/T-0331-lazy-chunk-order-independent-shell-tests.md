---
id: T-0331
title: Make the shell route tests independent of test order on cold `React.lazy` chunks (profile-gate AC-10 and AC-7, auth-guard AC-B6); T-0375 folded in
lane: web-shell
screens: [UF-01.1, UF-01.2, UF-01.5, UF-02.1]
decisions: [D-0103, D-0045, D-0073, D-0088, D-0091]
deps: [T-0301a]
status: ready
---
<!-- Groomed 2026-10-01 by product-owner (groom-0331). It folds in T-0375 (same class, same files). Build flow: wl-build-web. About ⅓ day. Test-only. SERIAL: this ticket edits apps/web/src/app/__tests__/profile-gate.test.tsx and apps/web/src/app/auth-guard.test.tsx. T-0301c also edits profile-gate.test.tsx and runs after this ticket. -->

## Why
Every shell route renders through `lazy(route.load)` inside `<Suspense fallback={null}>`. The `lazy()` instances sit in a module-scope `Map` in `app/App.tsx`, so a chunk is warm only if an earlier test in the same file already rendered that route. Some assertions check a screen synchronously, so whether they pass depends on test order:

- **`profile-gate.test.tsx` AC-10**, "/welcome renders on the first committed render" (around line 932). It fails when run alone (`bodyTextLen=0`). (T-0301a QA)
- **`profile-gate.test.tsx` AC-7**, "/account redirects for a `%s` profile too" (around line 653). It waits for the location, then checks the screen synchronously. It fails when it runs first or early (shuffle seed `1790895837776`). (T-0366 QA)
- **`auth-guard.test.tsx` AC-B6**, "renders UF-01.1 on the first committed render" (around line 127). Same shape. (T-0301b QA, T-0375)

The principle-5 point behind these tests still holds: nothing is awaited before UF-01.1. The defect is in the tests, not the product. D-0103 sets the fix: positive asserts wait, and a first-render check warms its own chunk. D-0103 also says why `vi.resetModules` is not the fix.

## Scope
- In (the two test files only):
  - **The at-risk positive asserts.** These are synchronous `toBeInTheDocument()` checks on a lazy screen that follow a wait on something else, such as a location, a spy or an auth event. Each one becomes `await waitFor(() => expect(…).toBeInTheDocument())` with the same selector, or the equivalent `await screen.findBy…`.
    - `profile-gate.test.tsx`:
      - the AC-7 `/account` table body (~661);
      - the QA account-switch "`missing` on /welcome → … HAS a profile" `UF-02.1` (~804);
      - the D-0073 §3 `stale` + `missing` `UF-01.1` (~905).
    - `auth-guard.test.tsx`:
      - "stale + online + network error stays signed in" `UF-02.1` (~169);
      - the next case's `UF-02.1` (~181).
    - Re-asserts that follow a wait on the *same* screen (for example ~369, ~408 and ~707) are "it stays" checks, and they stay as they are.
  - **The two first-render checks** (profile-gate AC-10 ~932, auth-guard AC-B6 ~127). Each one gets a warm-up at the start of its own `it`, per D-0103 §2:
    - Render the same route with the same auth state and `await` UF-01.1.
    - `cleanup()`.
    - Clear the call history of the spies the test asserts on. Keep each spy's implementation, so for example `getSession` still never settles.
    - Then render again. The existing synchronous assertions stay word for word.
  - **An order-independent twin for each first-render check**, per D-0103 §3. It does no warm-up. It renders with `fetch` and `getSession` never settling. It asserts synchronously that there are zero calls to:
    - `loadProfile`, `refreshProfile` and `spy.from` (profile-gate);
    - `getSession` (auth-guard).

    Then it `await screen.findByRole("heading", { level: 1, name: "Train with a plan. Log in seconds." })` and checks that the heading is inside `[data-screen-id="UF-01.1"]`.
  - **T-0375** is folded into this ticket. Its file is marked `folded`.
- Out:
  - Any non-test file. Any other test file, including `auth-guard.phase3.test.tsx` and `profile-gate.source.test.ts`.
  - `vi.resetModules`, a new separate test file, or any `timeout` option on `waitFor` or `findBy`.
  - Removing or loosening any assertion. Negative asserts (`not.toBeInTheDocument()`) stay synchronous, after the existing settle.
  - The `/welcome/save` rows. T-0301c owns those (D-0097 §2, D-0100 §1).

### Edge cases that are in scope
- **Zero history, cold start:** each changed test passes as the first and only test in its process. That is a cold chunk, the same as a first app launch.
- **Offline:** the `unknown` row of the AC-7 table (offline, no cache) must pass cold, and so must the auth-guard `stale + offline` case.
- Time running out and returning after 10 days off don't apply. The change is test-only.

## Acceptance criteria
Commands run from the worktree root. `V` stands for `pnpm --filter @workoutlab/web exec vitest run`.

- **AC-1 (before: the failures reproduce on main).** Before any edit, the dev runs each of these and records the command, the exit code and the first failing assertion in `testsRun`:
  1. `V src/app/__tests__/profile-gate.test.tsx -t 'first committed render'` fails.
  2. `V src/app/__tests__/profile-gate.test.tsx --sequence.shuffle --sequence.seed=1790895837776` fails, with a "/account redirects for a" case failing.
  3. `V src/app/auth-guard.test.tsx -t 'first committed render'` fails.
  4. `V src/app/auth-guard.test.tsx -t 'stays signed in'` and `V src/app/__tests__/profile-gate.test.tsx -t '/account redirects'`. Record the result either way. These show whether the other listed asserts were at risk too.
- **AC-2 (after: in isolation).** After the fix, commands 1 to 4 from AC-1 all pass. So do `V src/app/__tests__/profile-gate.test.tsx -t 'stale'` and `V src/app/__tests__/profile-gate.test.tsx -t 'HAS a profile'`.
- **AC-3 (after: shuffled).** Each file passes:
  - with `--sequence.shuffle --sequence.seed=1790895837776`;
  - with three more shuffled runs, each with a recorded seed;
  - in full, in default order.
- **AC-4 (first-render checks keep their meaning).** In the warmed AC-10 and AC-B6 cases, the assertions after the second `render` are word for word the same as on `main`: the synchronous heading in UF-01.1, plus the zero-call spies. Nothing between that `render` and those assertions is awaited. Each twin passes in isolation (`-t` with the twin's name).
- **AC-5 (the checks still catch a principle-5 regression).** Run two injected faults and record them. Neither is committed.
  1. Make `ProfileStatusProvider` call `loadProfile()` even when signed out. The warmed AC-10 case fails on `loadProfile` not being called, and so does its twin. Both fail in isolation and in the full file.
  2. Make the `/welcome` route render `null` until `getSession()` settles. For example, wrap the guest-only element so it waits on `supabase.auth.getSession()`. Both the warmed AC-B6 and its twin must fail; record which assertion each fails on (the warmed one may time out in its own warm-up, the twin may fail its zero-call check first). Also reset `spy.countFor('profiles')` (a counter, not a `vi.fn`) after the AC-10 warm-up.

  Revert both. `git diff main --stat` lists only the two test files and this ticket.
- **AC-6 (nothing weakened).** Given `git diff main` on the two files:
  - Every removed line is either a synchronous positive assert re-added inside `await waitFor(...)` / `findBy` with the same selector, or nothing at all.
  - No `expect` is removed. No negative assert changes.
  - No `timeout` option is added. No `it.skip` / `it.todo` / `it.fails` is added.
  - The test count rises by exactly 2, the two twins.
- `pnpm -w typecheck lint test` is green.

## Paths you may change
- `apps/web/src/app/__tests__/profile-gate.test.tsx` and `apps/web/src/app/auth-guard.test.tsx` (the lane: `web-shell`).
- **Listed extras:**
  - `docs/tickets/T-0331-lazy-chunk-order-independent-shell-tests.md`: this file, for the accept log.

## Contract impact
None.

## Definition of done
Tests for every AC pass, with recorded runs for AC-1, AC-3 and AC-5 · `pnpm -w typecheck lint test --force --concurrency=1` green · contracts unchanged · commits start `T-0331` and cite `UF-01.1` (for example `T-0331 UF-01.1: warm lazy chunk in first-render checks`).

## Notes
- **Flow:** `wl-build-web`.
- **Serial with:** T-0301c (`profile-gate.test.tsx`) and any other ticket that edits `auth-guard.test.tsx` or `profile-gate.test.tsx`. T-0301c's AC-13 already asks for `await waitFor` on the `stale` case (~905). After this ticket, that line already waits, so T-0301c only swaps `UF-01.1` for `UF-01.5-save` there and in the `/account` table's `missing` row.
- Ask review to check AC-6 line by line.

## Accept log

### Build 2026-10-01 (frontend-dev, `wl-build-web`)
`V` = `pnpm --filter @workoutlab/web exec vitest run`, from the worktree root.

- **AC-1 (before, on base `d200011`):**
  1. `V src/app/__tests__/profile-gate.test.tsx -t 'first committed render'`: exit 1. AC-10 fails at `profile-gate.test.tsx:942`, `Unable to find … role "heading" and name "Train with a plan. Log in seconds."`.
  2. `V src/app/__tests__/profile-gate.test.tsx --sequence.shuffle --sequence.seed=1790895837776`: exit 1. 1 of 88 tests fails: "/account redirects for a `unknown` profile too", at `:661`, `expect(screenOf("UF-02.1")).toBeInTheDocument()` with `Received: null`.
  3. `V src/app/auth-guard.test.tsx -t 'first committed render'`: exit 1. AC-B6 fails at `auth-guard.test.tsx:133`, the same heading `getByRole` error.
  4. `V src/app/auth-guard.test.tsx -t 'stays signed in'`: exit 1. Both cases fail, at `:169` and `:181` (`UF-02.1`, `null`). `V src/app/__tests__/profile-gate.test.tsx -t '/account redirects'`: exit 1. The `missing` row fails at `:661`.
  - Also before: `-t 'stale'` fails at `:905` and `-t 'HAS a profile'` fails at `:804` (both `UF-0x.x`, `null`). So every listed assert was at risk.
- **AC-2 (after):** commands 1 to 4, `-t 'stale'` and `-t 'HAS a profile'` all exit 0.
- **AC-3 (after):** each file passes in full in default order (profile-gate 89/89, auth-guard 21/21). Each also passes shuffled with seeds `1790895837776`, `11`, `424242` and `987654321`.
- **AC-4:** in the warmed AC-10 and AC-B6 cases, the asserts after the second `render` are word for word the same as before, with nothing awaited in between. `-t 'twin'` passes in each file.
- **AC-5 (faults were injected, run, and reverted, never committed):**
  1. `ProfileStatusProvider` statically imports `loadProfile` and calls it in the signed-out branch of `run()`. The warmed AC-10 fails at `:957` and the twin fails at `:972`, both on `expect(loadProfile).not.toHaveBeenCalled()`. Both fail in isolation (`-t 'first committed render'`, `-t 'twin'`) and in the full file. In the full file "and still nothing after the tree settles" also fails, at `:986`.
  2. In `App.tsx` the `guest-only` element is wrapped in a component that renders `null` until `supabase.auth.getSession()` settles. The warmed AC-B6 fails in its own warm-up at `:133` (`findByRole` heading, timeout). The twin fails first on its zero-call check, at `:155` (`expect(getSession).not.toHaveBeenCalled()`). Both fail in isolation and in the full file, where only these 2 tests fail.
  - After the warm-up, the AC-10 case clears the `spy.calls` counter (`spy.calls.length = 0`) as well as the `loadProfile`, `refreshProfile` and `spy.from` mock history.
  - `git diff main...HEAD --stat` lists only the two test files and this ticket.
- **AC-6:** the removed lines are:
  - the 2 `import` lines, which gain `cleanup`;
  - the 2 `it(…, () =>` headers, which become `async`;
  - 5 synchronous positive screen asserts, each re-added inside `await waitFor(() => …)` with the same selector.

  No `expect` is removed and no negative assert changes. No `timeout`, `skip`, `todo` or `fails` is added. Tests go 88→89 and 20→21 (+2, the twins).
- `pnpm --filter @workoutlab/web typecheck lint test`: green (72 files, 925 tests).
