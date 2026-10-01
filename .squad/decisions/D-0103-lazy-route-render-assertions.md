---
id: D-0103
title: "Shell route tests against `React.lazy` screens: positive screen asserts wait for the chunk, and a 'first committed render' check warms its own chunk inside the test"
status: revisit
date: 2026-10-01
by: product-owner (groom T-0331)
area: web
builds-on: D-0045 §13, D-0073, D-0088, D-0091 §1–§2
---
## Context
Every route in `apps/web/src/app/App.tsx` renders through `lazy(route.load)` inside
`<Suspense fallback={null}>`. The `lazy()` instances live in a module-scope `Map`
(`lazyComponents`), so a chunk is "warm" once any earlier test in the same file has rendered that
route. A test that asserts a screen synchronously therefore passes or fails depending on what ran
before it:

- `app/__tests__/profile-gate.test.tsx` AC-10 "/welcome renders on the first committed render"
  fails when run alone with `-t 'first committed render'` (`bodyTextLen=0`). (T-0301a QA, T-0331)
- The same file's AC-7 "/account redirects for a `%s` profile" fails when it runs first or early
  (shuffle seed `1790895837776`). It waits for the *location*, then asserts the *screen*
  synchronously. (T-0366 QA, T-0331)
- `app/auth-guard.test.tsx` AC-B6 "renders UF-01.1 on the first committed render" has the same
  shape. (T-0301b QA, T-0375)

T-0300 AC-B6 and T-0301a AC-10 say "the first committed render". What they actually require is
principle 5: no network, profile or Dexie work is awaited before UF-01.1. The `React.lazy`
shell already makes the literal first commit empty, and that is a shell design choice
(D-0045 §13), not a bug.

T-0375 suggested `vi.resetModules()`. It would make every render cold and so make the
synchronous check fail every time, rather than make it robust. It would also force a dynamic
re-import of `App.js` under the file's `vi.mock`s.

## Decision
1. **Positive asserts on a lazy screen wait.** In shell route tests (`apps/web/src/app/**`), an
   assertion that a `[data-screen-id]` or a screen's content *is present* uses
   `await waitFor(...)` or `await screen.findBy...`. This applies when it follows a wait on
   something else (a location, a spy) or when it comes first. Negative asserts
   (`not.toBeInTheDocument()`) stay synchronous, after the test's existing settle and a positive
   wait on the screen that should be there.
2. **"First committed render" means once the route's chunk is loaded.** A test that checks the
   synchronous first render warms its own chunk inside the same `it`. It renders the same route
   with the same auth state, awaits the screen, calls `cleanup()` and resets the spies it will
   assert. Then it does the real render and keeps the synchronous assertions exactly as they are.
   The warm-up is in the test body or that `describe`'s `beforeEach`. It never relies on another
   test.
3. **Principle 5 is still pinned without the warm-up.** Each first-render test has an
   order-independent twin. Render with `fetch` and `getSession` never settling, then assert
   synchronously that there are zero `loadProfile` / `refreshProfile` / `supabase.from` /
   `getSession` calls. Then `await findByRole("heading", { level: 1, name: "Train with a plan. Log in seconds." })`
   inside `[data-screen-id="UF-01.1"]`. If anything awaited the network before UF-01.1, the
   `findBy` would time out.
4. **`vi.resetModules` is not the fix.** See Context.
5. **Proof of order independence** is the file run in isolation with `-t`, with
   `--sequence.shuffle --sequence.seed=1790895837776`, and with three more shuffled seeds.

## Consequences
- T-0331 applies this to `profile-gate.test.tsx` and `auth-guard.test.tsx`. T-0375 is folded into
  T-0331.
- T-0301c (AC-13) already asks for `await waitFor` on `UF-01.5-save` and on the D-0073 §3 `stale`
  case. After T-0331 those lines already wait, so T-0301c only swaps the screen id.
- The T-0300 AC-B6 and T-0301a AC-10 wording is read as §2 from now on. The ticket files are history
  and are not edited.

## Revisit when
- The shell stops lazy-loading UF-01.1, for example by putting it in the entry chunk. Then the
  warm-up in §2 is redundant and can go.
- A shared test harness for `Shell` lands. Then §1–§2 move into a helper, for example
  `renderRoute(path, { warm: true })`.
